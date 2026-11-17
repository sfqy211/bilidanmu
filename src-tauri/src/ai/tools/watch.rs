//! 直播间长会话工具（仅 MCP）：开会话、按游标增量拉取、统计、停止。
//!
//! 与 `live_query_danmaku` 的短采样互补：短采样用于「现在在聊什么」，
//! 长会话用于「这场播了几个小时，帮我总结」。

use super::{api_with_main, args, current_room_id};
use crate::ai::emoticon;
use crate::ai::spec::ToolError;
use crate::ai::watch::{StoredEvent, DEFAULT_MAX_EVENTS};
use crate::models::message::DanmakuEvent;
use crate::AppState;
use serde_json::{json, Value};
use std::collections::HashMap;

/// 一次 collect 最多返回的条数上限
const MAX_COLLECT: u64 = 1000;

fn session_of(
    state: &AppState,
    raw: &Value,
) -> Result<std::sync::Arc<std::sync::Mutex<crate::ai::watch::WatchSession>>, ToolError> {
    let session_id = args::string(raw, "sessionId")?;
    state.live_watch.get(&session_id).ok_or_else(|| {
        ToolError::invalid_args(format!("会话 {session_id} 不存在（可能已被移除）"))
            .with_hint("用 live_watch_list 查看现有会话")
    })
}

fn lock_session(
    session: &std::sync::Arc<std::sync::Mutex<crate::ai::watch::WatchSession>>,
) -> std::sync::MutexGuard<'_, crate::ai::watch::WatchSession> {
    session.lock().unwrap_or_else(|error| error.into_inner())
}

/// 开一个长会话。只读采集：不切换当前直播间、不开窗口。
pub async fn start(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &Value,
) -> Result<Value, ToolError> {
    let room_id = args::u64_required(raw, "roomId")?;
    if room_id == 0 && !crate::bili::mock::is_enabled() {
        return Err(ToolError::invalid_args("roomId 必须是有效直播间号"));
    }

    let max_events = args::capped(raw, "maxEvents", DEFAULT_MAX_EVENTS as u64, 100, 100_000) as usize;
    let stop_on_end = args::bool_or(raw, "stopOnEnd", true);
    let want_transcript = args::bool_or(raw, "withTranscript", false);

    let api = api_with_main(state).await;
    let info = if room_id == crate::bili::mock::MOCK_ROOM_ID && crate::bili::mock::is_enabled() {
        crate::models::room::RoomInfo::mock(room_id)
    } else {
        api.get_room_info_ex(room_id, true)
            .await
            .map_err(super::classify_business_error)?
    };
    let real_room_id = info.room.room_id;
    if !info.is_live {
        return Ok(json!({
            "started": false,
            "live": false,
            "roomId": room_id,
            "realRoomId": real_room_id,
            "title": info.room.title,
            "anchor": info.room.uname,
            "hint": "该房间当前未开播；开播后再 start，或先用 live_query_danmaku 看状态",
        }));
    }

    // 保底时长：设置里的上限优先（0 = 用户允许不限时）
    let setting_minutes = crate::ai::policy::load_watch_max_minutes(state);
    let requested_minutes = args::opt_u64(raw, "maxMinutes").unwrap_or(setting_minutes);
    let effective_minutes = if setting_minutes == 0 {
        requested_minutes
    } else if requested_minutes == 0 {
        setting_minutes
    } else {
        requested_minutes.min(setting_minutes)
    };

    // 字幕只对「当前正在收听且开着语音转字幕」的房间可用
    let mut with_transcript = false;
    let mut transcript_hint: Option<String> = None;
    if want_transcript {
        let current = current_room_id(state);
        let same_room = matches!(current, Some(rid) if rid == room_id || rid == real_room_id);
        let stt_running = state.stt_manager.lock().await.is_some();
        if !same_room {
            transcript_hint = Some(
                "字幕只支持当前正在收听的直播间；这个会话继续只收弹幕".to_string(),
            );
        } else if !stt_running {
            transcript_hint =
                Some("当前没有运行语音转字幕，会话只收弹幕；可在设置里开启 STT 后重试".to_string());
        } else {
            with_transcript = true;
        }
    }

    let transcript_rx = with_transcript.then(|| state.transcript_bus.subscribe());
    let summary = state
        .live_watch
        .start(
            api,
            room_id,
            real_room_id,
            info.room.title.clone(),
            info.room.uname.clone(),
            effective_minutes.saturating_mul(60),
            max_events,
            stop_on_end,
            with_transcript,
            transcript_rx,
        )
        .map_err(ToolError::failed)?;

    let mut payload = serde_json::to_value(&summary)
        .map_err(|error| ToolError::failed(format!("序列化会话失败: {error}")))?;
    payload["started"] = json!(true);
    payload["live"] = json!(true);
    if let Some(hint) = transcript_hint {
        payload["transcriptHint"] = json!(hint);
    }
    payload["hint"] = json!(
        "用 live_watch_collect(sessionId, cursor) 增量拉取；游标从返回的 nextCursor 继续。总结前可先 live_watch_digest 看热度与表情分布。"
    );
    Ok(payload)
}

/// 按游标增量拉取。cursor 是「下一条要读的 seq」，取上一次返回的 nextCursor。
pub async fn collect(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &Value,
) -> Result<Value, ToolError> {
    let session = session_of(state, raw)?;
    let cursor = args::opt_u64(raw, "cursor").unwrap_or(0);
    let limit = args::capped(raw, "limit", 200, 1, MAX_COLLECT) as usize;
    let keyword = args::opt_string(raw, "keyword")
        .map(|text| text.trim().to_lowercase())
        .filter(|text| !text.is_empty());
    let types = parse_types(raw)?;
    let mode = args::opt_string(raw, "emoticonMode").unwrap_or_else(|| "keep".to_string());
    if !matches!(mode.as_str(), "keep" | "aggregate" | "drop") {
        return Err(ToolError::invalid_args(
            "emoticonMode 只能是 keep / aggregate / drop",
        ));
    }
    let include_senders = args::bool_or(raw, "includeSenders", false);
    let sender_limit = args::capped(raw, "senderLimit", 20, 1, 200) as usize;

    let guard = lock_session(&session);
    let from_seq = cursor.max(guard.evicted_before);
    let mut consumed = 0usize;
    let mut last_seq = from_seq.saturating_sub(1);
    let mut events: Vec<Value> = Vec::new();
    let mut emoticon_events: Vec<DanmakuEvent> = Vec::new();
    let mut transcripts: Vec<Value> = Vec::new();

    for (seq, stored) in guard.events.iter() {
        if *seq < from_seq {
            continue;
        }
        if consumed >= limit {
            break;
        }
        let kind = stored.kind();
        if let Some(types) = &types {
            if !types.iter().any(|item| item == kind) {
                continue;
            }
        }
        match stored {
            StoredEvent::Danmaku(event) => {
                if let Some(keyword) = &keyword {
                    if !event.content.to_lowercase().contains(keyword)
                        && !event.username.to_lowercase().contains(keyword)
                    {
                        continue;
                    }
                }
                let is_emoticon = emoticon::is_emoticon_like(event);
                consumed += 1;
                last_seq = *seq;
                match mode.as_str() {
                    "drop" if is_emoticon => {}
                    "aggregate" if is_emoticon => emoticon_events.push(event.clone()),
                    _ => events.push(super::live::compact_event(event)),
                }
            }
            StoredEvent::Transcript {
                text,
                audio_ts_ms,
                timestamp,
            } => {
                if let Some(keyword) = &keyword {
                    if !text.to_lowercase().contains(keyword) {
                        continue;
                    }
                }
                consumed += 1;
                last_seq = *seq;
                transcripts.push(json!({
                    "type": "transcript",
                    "seq": seq,
                    "content": text,
                    "timestamp": timestamp,
                    "audioTsMs": audio_ts_ms,
                }));
            }
        }
    }

    let next_cursor = if consumed == 0 {
        from_seq.max(guard.next_seq)
    } else {
        last_seq + 1
    };
    let summary = guard.summary();
    drop(guard);

    let emoticon_messages = emoticon_events.len();
    let groups = if mode == "aggregate" {
        Some(emoticon::aggregate(
            emoticon_events.into_iter(),
            include_senders,
            sender_limit,
        ))
    } else {
        None
    };
    let group_count = groups.as_ref().map(|items| items.len()).unwrap_or(0);

    let mut payload = json!({
        "sessionId": summary.session_id,
        "fromSeq": from_seq,
        "nextCursor": next_cursor,
        "count": events.len() + transcripts.len() + group_count,
        "events": events,
        "transcripts": transcripts,
        "evictedBefore": summary.evicted_before,
        "ended": summary.ended,
        "endReason": summary.end_reason,
        "stats": {
            "buffered": summary.buffered,
            "received": summary.received,
            "dropped": summary.dropped,
            "connected": summary.connected,
            "reconnects": summary.reconnects,
        }
    });
    if let Some(groups) = groups {
        payload["emoticonCount"] = json!(emoticon_messages);
        payload["emoticonGroups"] = json!(groups);
    }
    if cursor < summary.evicted_before {
        payload["skippedByEviction"] = json!(summary.evicted_before.saturating_sub(cursor));
    }
    Ok(payload)
}

/// 统计摘要：不返回正文，适合长会话先看热度与表情分布。
pub async fn digest(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &Value,
) -> Result<Value, ToolError> {
    let session = session_of(state, raw)?;
    let top_n = args::capped(raw, "topN", 10, 1, 50) as usize;
    let include_senders = args::bool_or(raw, "includeSenders", false);
    let sender_limit = args::capped(raw, "senderLimit", 5, 1, 50) as usize;

    let guard = lock_session(&session);
    let summary = guard.summary();

    let mut by_kind: HashMap<&'static str, u64> = HashMap::new();
    let mut user_counts: HashMap<String, u64> = HashMap::new();
    let mut danmaku_events: Vec<DanmakuEvent> = Vec::new();
    let mut gift_count = 0u64;
    let mut gift_total = 0u64;
    let mut gift_names: HashMap<String, (u64, u64)> = HashMap::new();
    let mut sc_count = 0u64;
    let mut sc_total = 0u64;
    let mut buckets: HashMap<u64, u64> = HashMap::new();
    let mut last_transcript: Option<String> = None;

    for (_, stored) in guard.events.iter() {
        *by_kind.entry(stored.kind()).or_insert(0) += 1;
        match stored {
            StoredEvent::Danmaku(event) => {
                let minute = event
                    .timestamp
                    .saturating_sub(summary.started_at)
                    / 60;
                match event.event_type.as_str() {
                    "danmaku" => {
                        *user_counts.entry(event.username.clone()).or_insert(0) += 1;
                        *buckets.entry(minute).or_insert(0) += 1;
                        danmaku_events.push(event.clone());
                    }
                    "gift" => {
                        gift_count += 1;
                        let price = event.price.unwrap_or(0) as u64;
                        let count = event.count.unwrap_or(1) as u64;
                        gift_total += price.saturating_mul(count);
                        let entry = gift_names
                            .entry(event.gift_name.clone().unwrap_or_default())
                            .or_insert((0, 0));
                        entry.0 += 1;
                        entry.1 = entry.1.saturating_add(price.saturating_mul(count));
                    }
                    "superChat" => {
                        sc_count += 1;
                        sc_total += event.price.unwrap_or(0) as u64;
                    }
                    _ => {}
                }
            }
            StoredEvent::Transcript { text, .. } => {
                last_transcript = Some(text.clone());
            }
        }
    }
    drop(guard);

    let unique_users = user_counts.len() as u64;
    let mut top_users: Vec<(String, u64)> = user_counts.into_iter().collect();
    top_users.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    let top_users: Vec<Value> = top_users
        .into_iter()
        .take(top_n)
        .map(|(username, count)| json!({ "username": username, "count": count }))
        .collect();

    let mut gift_top: Vec<(String, u64, u64)> = gift_names
        .into_iter()
        .map(|(name, (count, total))| (name, count, total))
        .collect();
    gift_top.sort_by(|a, b| b.2.cmp(&a.2));
    let gift_top: Vec<Value> = gift_top
        .into_iter()
        .take(top_n)
        .map(|(name, count, total)| json!({ "name": name, "count": count, "battery": total }))
        .collect();

    let max_minute = buckets.keys().copied().max().unwrap_or(0);
    let per_minute: Vec<Value> = (0..=max_minute.min(600))
        .map(|minute| json!({ "minute": minute, "count": buckets.get(&minute).copied().unwrap_or(0) }))
        .collect();

    let now = crate::ai::context::now_secs().max(0) as u64;
    Ok(json!({
        "sessionId": summary.session_id,
        "roomId": summary.room_id,
        "title": summary.title,
        "anchor": summary.anchor,
        "startedAt": summary.started_at,
        "durationSecs": now.saturating_sub(summary.started_at),
        "ended": summary.ended,
        "endReason": summary.end_reason,
        "byKind": by_kind,
        "uniqueUsers": unique_users,
        "topUsers": top_users,
        "emoticons": emoticon::aggregate(danmaku_events.into_iter(), include_senders, sender_limit),
        "gift": { "count": gift_count, "battery": gift_total, "top": gift_top },
        "superChat": { "count": sc_count, "price": sc_total },
        "perMinute": per_minute,
        "transcriptCount": summary.transcript_count,
        "lastTranscript": last_transcript,
        "stats": {
            "buffered": summary.buffered,
            "received": summary.received,
            "dropped": summary.dropped,
            "reconnects": summary.reconnects,
        }
    }))
}

/// 会话状态与缓冲情况。
pub async fn status(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &Value,
) -> Result<Value, ToolError> {
    let session = session_of(state, raw)?;
    let guard = lock_session(&session);
    serde_json::to_value(guard.summary())
        .map_err(|error| ToolError::failed(format!("序列化会话状态失败: {error}")))
}

/// 停止采集；默认保留缓冲供继续 collect，`remove = true` 时丢弃。
pub async fn stop(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &Value,
) -> Result<Value, ToolError> {
    let session_id = args::string(raw, "sessionId")?;
    let remove = args::bool_or(raw, "remove", false);
    let summary = state
        .live_watch
        .stop(&session_id, remove)
        .map_err(ToolError::invalid_args)?;
    let mut payload = serde_json::to_value(&summary)
        .map_err(|error| ToolError::failed(format!("序列化会话失败: {error}")))?;
    payload["removed"] = json!(remove);
    Ok(payload)
}

/// 列出全部会话（含已结束、仍在保留期内的）。
pub async fn list(
    _app: &tauri::AppHandle,
    state: &AppState,
    _raw: &Value,
) -> Result<Value, ToolError> {
    let sessions = state.live_watch.list();
    Ok(json!({
        "count": sessions.len(),
        "maxActive": crate::ai::watch::MAX_ACTIVE_SESSIONS,
        "sessions": sessions,
    }))
}

fn parse_types(raw: &Value) -> Result<Option<Vec<String>>, ToolError> {
    let Some(value) = raw.get("types") else {
        return Ok(None);
    };
    let Some(items) = value.as_array() else {
        return Err(ToolError::invalid_args("types 需要是字符串数组"));
    };
    let mut types = Vec::new();
    for item in items {
        let Some(text) = item.as_str() else {
            return Err(ToolError::invalid_args("types 需要是字符串数组"));
        };
        types.push(text.to_string());
    }
    Ok(Some(types))
}

