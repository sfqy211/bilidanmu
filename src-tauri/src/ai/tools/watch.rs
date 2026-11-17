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

/// 默认只返回弹幕与礼物；进场/点赞/SC/舰长等按需通过 types 打开
const DEFAULT_TYPES: &[&str] = &["danmaku", "gift"];
const VALID_TYPES: &[&str] = &[
    "danmaku",
    "gift",
    "super_chat",
    "guard",
    "enter",
    "like",
    "live",
    "transcript",
];

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
    // 会话默认是否带发送者；collect 每次可覆盖（热切换，不重连）
    let with_senders = args::bool_or(raw, "withSenders", false);

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
            with_senders,
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
    // 自动带上房间/全局记忆摘要，AI 不必额外调一次 memory get
    if let Some(memory) = memory_snapshot(state, room_id, real_room_id) {
        payload["memory"] = memory;
    }
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
    // 默认只看弹幕与礼物；每次调用都可换 types，热切换、不重连
    let types = effective_types(
        parse_types(raw)?
            .unwrap_or_else(|| DEFAULT_TYPES.iter().map(|item| item.to_string()).collect()),
    );
    // 默认丢弃表情：避免表情刷屏被 AI 当成聊天内容
    let mode = args::opt_string(raw, "emoticonMode").unwrap_or_else(|| "drop".to_string());
    if !matches!(mode.as_str(), "keep" | "aggregate" | "drop") {
        return Err(ToolError::invalid_args(
            "emoticonMode 只能是 keep / aggregate / drop",
        ));
    }
    let duplicate_mode =
        args::opt_string(raw, "duplicateMode").unwrap_or_else(|| "merge".to_string());
    if !matches!(duplicate_mode.as_str(), "merge" | "keep") {
        return Err(ToolError::invalid_args(
            "duplicateMode 只能是 merge / keep",
        ));
    }
    let sender_limit = args::capped(raw, "senderLimit", 20, 1, 200) as usize;

    let guard = lock_session(&session);
    // 发送者开关：本次显式传了就覆盖，否则跟随会话默认；两者都不重建连接
    let include_senders = raw
        .get("includeSenders")
        .and_then(Value::as_bool)
        .unwrap_or(guard.include_senders);
    let from_seq = cursor.max(guard.evicted_before);
    let mut consumed = 0usize;
    let mut last_seq = from_seq.saturating_sub(1);
    let mut danmaku_window: Vec<(u64, DanmakuEvent)> = Vec::new();
    let mut emoticon_events: Vec<DanmakuEvent> = Vec::new();
    let mut transcripts: Vec<Value> = Vec::new();

    for (seq, stored) in guard.events.iter() {
        if *seq < from_seq {
            continue;
        }
        if consumed >= limit {
            break;
        }
        if !types.iter().any(|item| item == stored.kind()) {
            continue;
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
                let is_emoticon = emoticon::is_pure_emoticon(event);
                consumed += 1;
                last_seq = *seq;
                match mode.as_str() {
                    "drop" if is_emoticon => {}
                    "aggregate" if is_emoticon => emoticon_events.push(event.clone()),
                    _ => danmaku_window.push((*seq, event.clone())),
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

    // 相同正文合并（默认）：只把出现 ≥2 次的收进 merged，其余按单条返回
    let (events, merged) = if duplicate_mode == "merge" {
        merge_duplicates(danmaku_window, include_senders, sender_limit)
    } else {
        let events = danmaku_window
            .iter()
            .map(|(seq, event)| {
                let mut value =
                    maybe_strip_sender(super::live::compact_event(event), include_senders);
                value["seq"] = json!(seq);
                value
            })
            .collect();
        (events, Vec::new())
    };

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
        "count": events.len() + transcripts.len() + group_count + merged.len(),
        "duplicateMode": duplicate_mode,
        "types": types,
        "includeSenders": include_senders,
        "events": events,
        "merged": merged,
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

/// 单条弹幕默认不带发送者：去掉 username / uid / avatar。
fn maybe_strip_sender(mut value: Value, include_senders: bool) -> Value {
    if include_senders {
        return value;
    }
    if let Some(object) = value.as_object_mut() {
        object.remove("username");
        object.remove("uid");
        object.remove("avatar");
    }
    value
}

struct MergeGroup {
    content: String,
    count: u64,
    first_seq: u64,
    last_seq: u64,
    first_at: u64,
    last_at: u64,
    sample: DanmakuEvent,
    senders: std::collections::HashMap<String, u64>,
}

/// 把相同正文的弹幕合并成 `danmakuGroup`；只出现一次的仍走普通事件。
fn merge_duplicates(
    items: Vec<(u64, DanmakuEvent)>,
    include_senders: bool,
    sender_limit: usize,
) -> (Vec<Value>, Vec<Value>) {
    let mut order: Vec<String> = Vec::new();
    let mut groups: std::collections::HashMap<String, MergeGroup> = std::collections::HashMap::new();

    let mut non_danmaku: Vec<(u64, DanmakuEvent)> = Vec::new();
    for (seq, event) in items {
        // 只合并文字弹幕；礼物/进场/点赞等结构化事件单独返回，不包成 danmakuGroup
        if event.event_type != "danmaku" {
            non_danmaku.push((seq, event));
            continue;
        }
        // 纯表情 / 带表情的文字 / 普通文字分开合并，避免同类不同义混在一起
        let prefix = if emoticon::is_pure_emoticon(&event) {
            "e"
        } else if emoticon::emoticon_meta(&event).is_some() {
            "i"
        } else {
            "t"
        };
        let key = format!("{prefix}:{}", event.content.trim());
        let group = groups.entry(key.clone()).or_insert_with(|| {
            order.push(key.clone());
            MergeGroup {
                content: event.content.trim().to_string(),
                count: 0,
                first_seq: seq,
                last_seq: seq,
                first_at: event.timestamp,
                last_at: event.timestamp,
                sample: event.clone(),
                senders: std::collections::HashMap::new(),
            }
        });
        group.count += 1;
        group.last_seq = seq;
        group.last_at = event.timestamp;
        if !event.username.is_empty() {
            *group.senders.entry(event.username.clone()).or_insert(0) += 1;
        }
    }

    let mut singles: Vec<Value> = non_danmaku
        .into_iter()
        .map(|(seq, event)| {
            let mut value = maybe_strip_sender(super::live::compact_event(&event), include_senders);
            value["seq"] = json!(seq);
            value
        })
        .collect();
    let mut merged: Vec<Value> = Vec::new();
    for key in order {
        let Some(group) = groups.remove(&key) else {
            continue;
        };
        if group.count >= 2 {
            let mut value = json!({
                "type": "danmakuGroup",
                "content": group.content,
                "count": group.count,
                "firstSeq": group.first_seq,
                "lastSeq": group.last_seq,
                "firstAt": group.first_at,
                "lastAt": group.last_at,
            });
            if emoticon::is_pure_emoticon(&group.sample) {
                value["type"] = json!("emoticonGroup");
                value["isEmoticon"] = json!(true);
                if let Some(meta) = emoticon::emoticon_meta(&group.sample) {
                    let mut emoticon = json!({
                        "unique": meta.unique,
                        "name": meta.name,
                        "kind": "sticker",
                    });
                    if let Some(url) = meta.url {
                        emoticon["url"] = json!(url);
                    }
                    value["emoticon"] = emoticon;
                }
                if emoticon::is_emoji_only(&group.sample.content) {
                    value["emojiOnly"] = json!(true);
                }
            } else if emoticon::emoticon_meta(&group.sample).is_some() {
                value["isEmoticon"] = json!(true);
                value["inlineEmoticon"] = json!(true);
            }
            if include_senders {
                let mut senders: Vec<(String, u64)> = group.senders.into_iter().collect();
                senders.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
                value["senderCount"] = json!(senders.len());
                let truncated = senders.len() > sender_limit;
                let senders: Vec<Value> = senders
                    .into_iter()
                    .take(sender_limit)
                    .map(|(username, count)| json!({ "username": username, "count": count }))
                    .collect();
                value["senders"] = json!(senders);
                if truncated {
                    value["sendersTruncated"] = json!(true);
                }
            }
            merged.push(value);
        } else {
            let mut value = maybe_strip_sender(
                super::live::compact_event(&group.sample),
                include_senders,
            );
            value["seq"] = json!(group.first_seq);
            singles.push(value);
        }
    }
    (singles, merged)
}

/// 单独查询某个 seq 或某段正文的发送者（默认不返回，按需再查）。
pub async fn senders(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &Value,
) -> Result<Value, ToolError> {
    let session = session_of(state, raw)?;
    let seq = args::opt_u64(raw, "seq");
    let content = args::opt_string(raw, "content")
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty());
    if seq.is_none() && content.is_none() {
        return Err(ToolError::invalid_args("需要 seq 或 content 之一").with_hint(
            "单条用 collect 返回事件里的 seq；整段相同弹幕传 content（可配 fromSeq/toSeq 缩范围）",
        ));
    }
    let from_seq = args::opt_u64(raw, "fromSeq").unwrap_or(0);
    let to_seq = args::opt_u64(raw, "toSeq").unwrap_or(u64::MAX);

    let guard = lock_session(&session);
    let mut count = 0u64;
    let mut matched_content: Option<String> = None;
    let mut senders: std::collections::HashMap<(String, u64), (u64, u64, u64)> =
        std::collections::HashMap::new();
    let mut samples: Vec<Value> = Vec::new();

    for (event_seq, stored) in guard.events.iter() {
        if *event_seq < from_seq || *event_seq > to_seq {
            continue;
        }
        let StoredEvent::Danmaku(event) = stored else {
            continue;
        };
        if event.event_type != "danmaku" {
            continue;
        }
        let matched = match (seq, &content) {
            (Some(target), _) => *event_seq == target,
            (None, Some(text)) => event.content.trim() == text,
            _ => false,
        };
        if !matched {
            continue;
        }
        count += 1;
        matched_content.get_or_insert_with(|| event.content.trim().to_string());
        let entry = senders
            .entry((event.username.clone(), event.uid))
            .or_insert((0, event.timestamp, event.timestamp));
        entry.0 += 1;
        entry.1 = entry.1.min(event.timestamp);
        entry.2 = entry.2.max(event.timestamp);
        if samples.len() < 10 {
            samples.push(json!({
                "seq": event_seq,
                "timestamp": event.timestamp,
                "username": event.username,
                "uid": event.uid,
            }));
        }
    }

    let mut senders: Vec<((String, u64), (u64, u64, u64))> = senders.into_iter().collect();
    senders.sort_by(|a, b| b.1 .0.cmp(&a.1 .0));
    let senders: Vec<Value> = senders
        .into_iter()
        .map(|((username, uid), (count, first_at, last_at))| {
            json!({
                "username": username,
                "uid": uid,
                "count": count,
                "firstAt": first_at,
                "lastAt": last_at,
            })
        })
        .collect();

    Ok(json!({
        "sessionId": guard.session_id,
        "content": matched_content,
        "count": count,
        "senders": senders,
        "samples": samples,
        "hint": if count == 0 {
            Some("没有匹配到弹幕；seq 可能已被缓冲淘汰，或用 content 在更大范围查")
        } else {
            None
        },
    }))
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

/// 开会话时顺带取房间/全局记忆的摘要（截断上限见 ai::memory）。
fn memory_snapshot(state: &AppState, room_id: u64, real_room_id: u64) -> Option<Value> {
    let guard = state.db.lock().ok()?;
    let connection = guard.as_ref()?;
    let room = crate::ai::memory::get(connection, "room", real_room_id)
        .ok()
        .flatten()
        .or_else(|| {
            crate::ai::memory::get(connection, "room", room_id)
                .ok()
                .flatten()
        });
    let global = crate::ai::memory::get(connection, "global", 0)
        .ok()
        .flatten();
    if room.is_none() && global.is_none() {
        return None;
    }

    let mut value = json!({});
    if let Some(entry) = room {
        let (content, truncated) =
            crate::ai::memory::snippet(&entry.content, crate::ai::memory::ROOM_SNIPPET_CHARS);
        value["room"] = json!({
            "content": content,
            "chars": entry.chars,
            "updatedAt": entry.updated_at,
            "truncated": truncated,
        });
    }
    if let Some(entry) = global {
        let (content, truncated) =
            crate::ai::memory::snippet(&entry.content, crate::ai::memory::GLOBAL_SNIPPET_CHARS);
        value["global"] = json!({
            "content": content,
            "chars": entry.chars,
            "updatedAt": entry.updated_at,
            "truncated": truncated,
        });
    }
    value["hint"] = json!("这是记忆摘要；完整内容用 memory{action:\"get\"} 读取");
    Some(value)
}

/// SC 是特殊弹幕：只要开了弹幕或礼物，就自动带上 super_chat。
fn effective_types(requested: Vec<String>) -> Vec<String> {
    let mut types = requested;
    let wants_message = types
        .iter()
        .any(|item| item == "danmaku" || item == "gift");
    if wants_message && !types.iter().any(|item| item == "super_chat") {
        types.push("super_chat".to_string());
    }
    types
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
        if !VALID_TYPES.contains(&text) {
            return Err(ToolError::invalid_args(format!("未知事件类型 {text}"))
                .with_hint(format!("可选：{}", VALID_TYPES.join(" / "))));
        }
        types.push(text.to_string());
    }
    if types.is_empty() {
        return Err(ToolError::invalid_args("types 不能为空数组"));
    }
    Ok(Some(types))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn danmaku(content: &str, username: &str) -> DanmakuEvent {
        serde_json::from_value(json!({
            "id": "1",
            "roomId": 1,
            "type": "danmaku",
            "username": username,
            "content": content,
            "timestamp": 1,
            "uid": 42,
            "color": 16777215,
            "guardLevel": 0,
            "isAdmin": false,
            "dmType": 0
        }))
        .expect("event")
    }

    #[test]
    fn merges_duplicates_and_hides_senders_by_default() {
        let items = vec![
            (1, danmaku("哈哈", "a")),
            (2, danmaku("哈哈", "b")),
            (3, danmaku("独特", "a")),
        ];
        let (events, merged) = merge_duplicates(items, false, 20);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0]["count"], 2);
        assert!(merged[0].get("senders").is_none());
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["content"], "独特");
        assert!(events[0].get("username").is_none());
        assert!(events[0].get("uid").is_none());
        assert_eq!(events[0]["content"], "独特");
    }

    #[test]
    fn include_senders_keeps_identity_and_group_details() {
        let items = vec![
            (1, danmaku("哈哈", "a")),
            (2, danmaku("哈哈", "a")),
            (3, danmaku("哈哈", "b")),
        ];
        let (events, merged) = merge_duplicates(items, true, 20);
        assert!(events.is_empty());
        assert_eq!(merged[0]["senderCount"], 2);
        assert_eq!(merged[0]["senders"][0]["username"], "a");
        assert_eq!(merged[0]["senders"][0]["count"], 2);
    }

    #[test]
    fn strip_sender_only_removes_identity() {
        let value = json!({"content": "x", "username": "u", "uid": 1, "timestamp": 2});
        let stripped = maybe_strip_sender(value, false);
        assert!(stripped.get("username").is_none());
        assert!(stripped.get("uid").is_none());
        assert_eq!(stripped["content"], "x");
    }

    #[test]
    fn merged_text_keeps_original_content() {
        let items = vec![
            (1, danmaku("哈哈", "a")),
            (2, danmaku("哈哈", "b")),
        ];
        let (_, merged) = merge_duplicates(items, false, 20);
        assert_eq!(merged[0]["type"], "danmakuGroup");
        assert_eq!(merged[0]["content"], "哈哈");
    }

    #[test]
    fn super_chat_follows_danmaku_or_gift() {
        assert_eq!(
            effective_types(vec!["danmaku".into(), "gift".into()]),
            vec!["danmaku", "gift", "super_chat"]
        );
        assert_eq!(
            effective_types(vec!["danmaku".into()]),
            vec!["danmaku", "super_chat"]
        );
        assert_eq!(
            effective_types(vec!["gift".into()]),
            vec!["gift", "super_chat"]
        );
        assert_eq!(effective_types(vec!["enter".into()]), vec!["enter"]);
        assert_eq!(
            effective_types(vec!["danmaku".into(), "super_chat".into()]),
            vec!["danmaku", "super_chat"]
        );
    }

    #[test]
    fn parse_types_rejects_unknown_and_empty() {
        assert!(parse_types(&json!({})).unwrap().is_none());
        let ok = parse_types(&json!({"types": ["danmaku", "gift"]})).unwrap().unwrap();
        assert_eq!(ok, vec!["danmaku".to_string(), "gift".to_string()]);
        assert!(parse_types(&json!({"types": ["nope"]})).is_err());
        assert!(parse_types(&json!({"types": []})).is_err());
    }

    #[test]
    fn gift_events_are_not_merged_into_danmaku_group() {
        let mut gift = danmaku("投喂了 人气票 ×1", "a");
        gift.event_type = "gift".to_string();
        let items = vec![(1, gift.clone()), (2, gift)];
        let (events, merged) = merge_duplicates(items, false, 20);
        assert!(merged.is_empty());
        assert_eq!(events.len(), 2);
        assert_eq!(events[0]["type"], "gift");
    }

    #[test]
    fn merged_emoticons_keep_marker() {
        let mut sticker = danmaku("一几一几", "a");
        sticker.dm_type = 1;
        let items = vec![(1, sticker.clone()), (2, sticker)];
        let (events, merged) = merge_duplicates(items, false, 20);
        assert!(events.is_empty());
        assert_eq!(merged[0]["type"], "emoticonGroup");
        assert_eq!(merged[0]["isEmoticon"], true);
        assert_eq!(merged[0]["count"], 2);
        assert_eq!(merged[0]["content"], "一几一几");
    }
}
