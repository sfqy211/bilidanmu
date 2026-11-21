//! 直播间上下文工具：AI 理解"现在直播间在发生什么"的核心入口。

use super::{api_with_main, args};
use crate::ai::context::now_secs;
use crate::ai::spec::ToolError;
use crate::AppState;

/// 一次取回直播间全貌：房间信息 + 实时指标 + 最近弹幕 + 礼物聚合。
///
/// 这是最常用的工具——模型不必自己拼接多条事件流。默认返回最近 40 条弹幕
/// （够看出话题），需要更多再调 `live_query_danmaku`。
pub async fn get_context(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let danmaku_limit = args::capped(raw, "danmakuLimit", 40, 1, 300) as usize;
    // 默认不返回表情：避免表情刷屏被当成聊天内容
    let include_emoticons = args::bool_or(raw, "includeEmoticons", false);
    let gift_limit = args::capped(raw, "giftLimit", 20, 0, 200) as usize;
    let include_activity = args::bool_or(raw, "includeActivity", false);
    let include_transcript = args::bool_or(raw, "includeTranscript", false);
    let transcript_limit = args::capped(raw, "transcriptLimit", 30, 1, 300) as usize;

    let context = state
        .live_context
        .lock()
        .map_err(|_| ToolError::failed("读取直播间上下文失败（锁中毒）"))?;

    let room_id = context.room_id.ok_or_else(ToolError::not_in_room)?;

    // 房间静态信息优先用已保存记录；虚拟直播间不在保存列表里，回退到内置占位信息
    let mock_info = (room_id == crate::bili::mock::MOCK_ROOM_ID
        && crate::bili::mock::is_enabled())
        .then(|| crate::models::room::RoomInfo::mock(room_id));
    let display = crate::room_store::get_room_display_info(state, room_id).or_else(|| {
        mock_info
            .as_ref()
            .map(|info| (info.room.uname.clone(), info.room.title.clone()))
    });
    let live_status = state
        .live_status
        .lock()
        .ok()
        .and_then(|map| map.as_ref().and_then(|map| {
            // live_status 以 UID 为键，需要先取房间的 uid
            let uid = mock_info
                .as_ref()
                .and_then(|info| info.room.uid)
                .or_else(|| {
                    crate::room_store::load_rooms(state)
                        .ok()?
                        .into_iter()
                        .find(|room| room.room_id == room_id)?
                        .uid
                })?;
            map.get(&uid).cloned()
        }));

    let live_start_time = live_status.as_ref().and_then(|status| status.live_start_time);
    let is_live = live_status.as_ref().map(|status| status.is_live).unwrap_or(false);

    let recent: Vec<serde_json::Value> = context
        .recent_danmaku(danmaku_limit)
        .into_iter()
        .filter(|event| include_emoticons || !crate::ai::emoticon::is_pure_emoticon(event))
        .map(compact_event)
        .collect();

    let gifts: Vec<serde_json::Value> = context
        .recent_gifts(gift_limit)
        .into_iter()
        .map(compact_event)
        .collect();

    let mut result = serde_json::json!({
        "roomId": room_id,
        "uname": display.as_ref().map(|(uname, _)| uname.clone()).unwrap_or_default(),
        "roomTitle": context
            .title
            .clone()
            .or_else(|| live_status.as_ref().map(|status| status.title.clone()))
            .or_else(|| display.as_ref().map(|(_, title)| title.clone()))
            .unwrap_or_default(),
        "isLive": is_live,
        "liveStartTime": live_start_time,
        "liveDurationSecs": context.session_duration_secs(live_start_time),
        "wsConnected": context.connected,
        "metrics": {
            "popularity": context.popularity,
            "onlineCount": context.online_count,
            "watchedCount": context.watched_count,
            "likeCount": context.like_count,
            "danmakuPerMinute": context.danmaku_per_minute(),
        },
        "recentDanmaku": recent,
        "recentGifts": gifts,
        "topSpeakers": context
            .top_speakers(10)
            .into_iter()
            .map(|(username, uid, count)| serde_json::json!({
                "username": username,
                "uid": uid,
                "count": count,
            }))
            .collect::<Vec<_>>(),
        "giftSummary": context.gift_summary(10),
        "serverTime": now_secs(),
    });

    if include_activity {
        result["recentActivity"] = serde_json::Value::Array(
            context
                .recent_activity(50)
                .into_iter()
                .map(compact_event)
                .collect(),
        );
    }

    if include_transcript {
        result["recentTranscripts"] = serde_json::Value::Array(
            context
                .recent_transcripts(transcript_limit)
                .iter()
                .map(compact_transcript)
                .collect(),
        );
    }

    Ok(result)
}

/// 按条件检索缓冲区里的弹幕：支持关键词与类型过滤，供模型回溯。
pub async fn query_danmaku(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let keyword = args::opt_string(raw, "keyword");
    let limit = args::capped(raw, "limit", 50, 1, 300) as usize;
    let include_emoticons = args::bool_or(raw, "includeEmoticons", false);

    // 指定 roomId：对任意直播间做临时只读采样——独立连接采集几秒后关闭，
    // 不切换当前直播间、不开窗口、不写上下文缓冲。
    if let Some(room_id) = args::opt_u64(raw, "roomId") {
        if room_id == 0 && !crate::bili::mock::is_enabled() {
            return Err(ToolError::invalid_args("roomId 必须是有效直播间号"));
        }
        let seconds = args::capped(raw, "seconds", 8, 3, 60);
        let api = api_with_main(state).await;

        // 先查房间：不存在直接报错，未开播明确说明（否则空采样会被误读成"没人说话"）
        let info = if room_id == crate::bili::mock::MOCK_ROOM_ID
            && crate::bili::mock::is_enabled()
        {
            crate::models::room::RoomInfo::mock(room_id)
        } else {
            api.get_room_info_ex(room_id, true)
                .await
                .map_err(super::classify_business_error)?
        };
        let real_room_id = info.room.room_id;
        let meta = serde_json::json!({
            "roomId": room_id,
            "realRoomId": real_room_id,
            "live": info.is_live,
            "title": info.room.title,
            "anchor": info.room.uname,
        });
        if !info.is_live {
            let mut payload = meta;
            payload["sampledSeconds"] = serde_json::json!(0);
            payload["count"] = serde_json::json!(0);
            payload["events"] = serde_json::json!([]);
            payload["hint"] = serde_json::json!("该房间当前未开播，直播弹幕只能在开播时采样");
            return Ok(payload);
        }

        let sampled = crate::bili::room_sample::sample_room_danmaku(
            &api, real_room_id, seconds, 300,
        )
        .await
        .map_err(ToolError::failed)?
        .into_iter()
        .filter(|event| include_emoticons || !crate::ai::emoticon::is_pure_emoticon(event))
        .collect::<Vec<_>>();
        let filtered: Vec<_> = match &keyword {
            Some(keyword) if !keyword.trim().is_empty() => {
                let needle = keyword.trim().to_lowercase();
                sampled
                    .into_iter()
                    .filter(|event| {
                        event.content.to_lowercase().contains(&needle)
                            || event.username.to_lowercase().contains(&needle)
                    })
                    .collect()
            }
            _ => sampled,
        };
        let events: Vec<serde_json::Value> = filtered.iter().take(limit).map(compact_event).collect();
        let mut payload = meta;
        payload["sampledSeconds"] = serde_json::json!(seconds);
        payload["count"] = serde_json::json!(events.len());
        payload["sampled"] = serde_json::json!(filtered.len());
        payload["events"] = serde_json::json!(events);
        return Ok(payload);
    }

    let context = state
        .live_context
        .lock()
        .map_err(|_| ToolError::failed("读取直播间上下文失败（锁中毒）"))?;

    if context.room_id.is_none() {
        return Err(ToolError::not_in_room());
    }

    let events: Vec<serde_json::Value> = match &keyword {
        Some(keyword) if !keyword.trim().is_empty() => context
            .search_danmaku(keyword.trim(), limit)
            .into_iter()
            .filter(|event| include_emoticons || !crate::ai::emoticon::is_pure_emoticon(event))
            .map(compact_event)
            .collect(),
        _ => context
            .recent_danmaku(limit)
            .into_iter()
            .filter(|event| include_emoticons || !crate::ai::emoticon::is_pure_emoticon(event))
            .map(compact_event)
            .collect(),
    };

    let total_buffered = context.recent_danmaku(usize::MAX).len();

    Ok(serde_json::json!({
        "keyword": keyword,
        "count": events.len(),
        "bufferedDanmaku": total_buffered,
        "events": events,
    }))
}

/// 检索当前房间缓冲的语音字幕（STT 开启期间累积的定稿片段）。
/// 字幕只存在于内存滚动缓冲，比弹幕少得多——直接全量取出再在工具侧过滤即可。
pub async fn query_transcript(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let keyword = args::opt_string(raw, "keyword");
    let limit = args::capped(raw, "limit", 50, 1, 300) as usize;
    let since = args::opt_u64(raw, "since");

    let context = state
        .live_context
        .lock()
        .map_err(|_| ToolError::failed("读取直播间上下文失败（锁中毒）"))?;
    let room_id = context.room_id.ok_or_else(ToolError::not_in_room)?;
    let mut entries = context.recent_transcripts(usize::MAX);
    drop(context);

    if let Some(keyword) = keyword.as_deref() {
        let needle = keyword.trim().to_lowercase();
        if !needle.is_empty() {
            entries.retain(|entry| entry.text.to_lowercase().contains(&needle));
        }
    }
    if let Some(since) = since {
        entries.retain(|entry| entry.timestamp >= since as i64);
    }
    let total = entries.len();
    if entries.len() > limit {
        entries = entries.split_off(entries.len() - limit);
    }

    Ok(serde_json::json!({
        "roomId": room_id,
        "count": entries.len(),
        "matched": total,
        "transcripts": entries.iter().map(compact_transcript).collect::<Vec<_>>(),
        "hint": "字幕只在 STT 运行期间于内存累积（最多 500 条），切换房间或退出应用即清空；更早的内容无法回溯",
    }))
}

/// 只取指标，不拉弹幕正文——用于高频轮询场景。
pub async fn get_stats(
    _app: &tauri::AppHandle,
    state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let context = state
        .live_context
        .lock()
        .map_err(|_| ToolError::failed("读取直播间上下文失败（锁中毒）"))?;

    let room_id = context.room_id.ok_or_else(ToolError::not_in_room)?;

    Ok(serde_json::json!({
        "roomId": room_id,
        "wsConnected": context.connected,
        "popularity": context.popularity,
        "onlineCount": context.online_count,
        "watchedCount": context.watched_count,
        "likeCount": context.like_count,
        "danmakuPerMinute": context.danmaku_per_minute(),
        "title": context.title,
        "serverTime": now_secs(),
    }))
}

/// 字幕条目的模型友好形状：与 TranscriptEntry 的 camelCase 序列化保持一致
pub(crate) fn compact_transcript(entry: &crate::ai::context::TranscriptEntry) -> serde_json::Value {
    serde_json::json!({
        "text": entry.text,
        "audioTsMs": entry.audio_ts_ms,
        "epoch": entry.epoch,
        "timestamp": entry.timestamp,
    })
}

// ── 语音字幕与音频控制（AI/MCP） ────────────────────────────

/// STT 状态总览：设置开关、管线运行、音频播放（由流代理活跃连接数判断）。
/// `listening` = 管线在跑且有音频客户端连接，只有这个状态才会真正产出字幕。
async fn stt_status_payload(state: &AppState) -> Result<serde_json::Value, ToolError> {
    let settings = crate::settings_store::load_settings(state)
        .map_err(|e| ToolError::failed(format!("读取设置失败: {e}")))?;
    let (room_id, buffered_transcripts) = {
        let context = state
            .live_context
            .lock()
            .map_err(|_| ToolError::failed("读取直播间上下文失败（锁中毒）"))?;
        (context.room_id, context.transcript_count())
    };
    let running = state.stt_manager.lock().await.is_some();
    let audio_clients = state.stream_proxy.audio_client_count();
    let listening = running && audio_clients > 0;

    let mut payload = serde_json::json!({
        "roomId": room_id,
        "enabled": settings.stt.enabled,
        "running": running,
        "modelId": settings.stt.model_id,
        "audioClients": audio_clients,
        "listening": listening,
        "bufferedTranscripts": buffered_transcripts,
    });
    if running && audio_clients == 0 {
        payload["hint"] = serde_json::json!(
            "字幕管线在跑但音频没有播放（没有 /live-audio 连接），不会有新字幕；用 live audio_play 开启音频"
        );
    } else if !running && settings.stt.enabled {
        payload["hint"] = serde_json::json!("开关已打开但管线未运行，用 live stt_start 启动");
    }
    Ok(payload)
}

/// 查询语音字幕与音频状态。
pub async fn stt_status(
    _app: &tauri::AppHandle,
    state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    stt_status_payload(state).await
}

/// 开启语音字幕：写 stt.enabled 设置（与弹幕窗开关同一事实源）并确保管线启动。
/// 字幕数据依赖音频播放：音频没播时只翻开关，音频一播字幕就出来。
pub async fn stt_start(
    app: &tauri::AppHandle,
    state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    {
        let context = state
            .live_context
            .lock()
            .map_err(|_| ToolError::failed("读取直播间上下文失败（锁中毒）"))?;
        if context.room_id.is_none() {
            return Err(ToolError::not_in_room());
        }
    }

    let mut settings = crate::settings_store::load_settings(state)
        .map_err(|e| ToolError::failed(format!("读取设置失败: {e}")))?;
    if !settings.stt.enabled {
        settings.stt.enabled = true;
        crate::settings_store::save_settings(state, &settings)
            .map_err(|e| ToolError::failed(format!("保存设置失败: {e}")))?;
        // 广播给各窗口：弹幕窗的联动 effect 依赖 store 里的开关状态，
        // 不同步的话音频一播它就会把 MCP 刚启动的管线停掉
        use tauri::Emitter;
        let _ = app.emit("settings-changed", &settings);
    }
    crate::commands::stt::ensure_stt_pipeline(app, state)
        .await
        .map_err(ToolError::failed)?;

    let mut payload = stt_status_payload(state).await?;
    payload["started"] = serde_json::json!(true);
    Ok(payload)
}

/// 关闭语音字幕：写回 stt.enabled=false 并停止管线（与弹幕窗开关同一事实源）。
pub async fn stt_stop(
    app: &tauri::AppHandle,
    state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let mut settings = crate::settings_store::load_settings(state)
        .map_err(|e| ToolError::failed(format!("读取设置失败: {e}")))?;
    settings.stt.enabled = false;
    crate::settings_store::save_settings(state, &settings)
        .map_err(|e| ToolError::failed(format!("保存设置失败: {e}")))?;
    use tauri::Emitter;
    let _ = app.emit("settings-changed", &settings);
    crate::commands::stt::stop_stt_pipeline(state)
        .await
        .map_err(ToolError::failed)?;

    let mut payload = stt_status_payload(state).await?;
    payload["stopped"] = serde_json::json!(true);
    Ok(payload)
}

/// 播放弹幕窗音频（发给弹幕窗执行，效果与用户点播放按钮一致）。
pub async fn audio_play(
    app: &tauri::AppHandle,
    _state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    crate::commands::room::set_live_audio_playback_inner(app, true)
        .await
        .map_err(ToolError::failed)?;
    Ok(serde_json::json!({
        "play": true,
        "hint": "播放命令已发给弹幕窗；字幕需要 STT 开启（live stt_status 查看 listening）",
    }))
}

/// 停止弹幕窗音频播放。
pub async fn audio_stop(
    app: &tauri::AppHandle,
    _state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    crate::commands::room::set_live_audio_playback_inner(app, false)
        .await
        .map_err(ToolError::failed)?;
    Ok(serde_json::json!({ "play": false }))
}

/// 事件压缩成模型友好的形状：去掉 UI 专用字段（颜色、背景图、表情选项等），
/// 保留语义字段。原始字段对模型是噪音，还会吃 token。
pub(crate) fn compact_event(event: &crate::models::message::DanmakuEvent) -> serde_json::Value {
    // 对外类型名与 types 过滤枚举保持一致（解析器内部用 entry / superChat）
    let event_type = match event.event_type.as_str() {
        "entry" => "enter",
        "superChat" => "super_chat",
        other => other,
    };
    let mut value = serde_json::json!({
        "type": event_type,
        "username": event.username,
        "uid": event.uid,
        "content": event.content,
        "timestamp": event.timestamp,
    });
    let map = value.as_object_mut().expect("刚构造的对象");

    if let Some(translated) = event.content_trans.as_ref().filter(|text| !text.is_empty()) {
        map.insert("translated".to_string(), serde_json::json!(translated));
    }
    if let Some(gift_name) = &event.gift_name {
        map.insert("giftName".to_string(), serde_json::json!(gift_name));
    }
    if let Some(count) = event.count {
        map.insert("count".to_string(), serde_json::json!(count));
    }
    if let Some(price) = event.price {
        map.insert("price".to_string(), serde_json::json!(price));
    }
    if let Some(medal) = &event.medal {
        map.insert(
            "medal".to_string(),
            serde_json::json!({ "name": medal.name, "level": medal.level }),
        );
    }
    if event.guard_level > 0 {
        map.insert("guardLevel".to_string(), serde_json::json!(event.guard_level));
    }
    if event.wealth_level.unwrap_or(0) > 0 {
        map.insert(
            "wealthLevel".to_string(),
            serde_json::json!(event.wealth_level),
        );
    }
    if let Some(bubble) = event.bubble_color.as_ref().filter(|text| !text.is_empty()) {
        map.insert("bubbleColor".to_string(), serde_json::json!(bubble));
    }
    // 表情类弹幕打标：大表情 isEmoticon、纯 emoji 文本 emojiOnly
    crate::ai::emoticon::decorate(&mut value, event);
    value
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compact_event_normalizes_type_names() {
        let event: crate::models::message::DanmakuEvent = serde_json::from_value(serde_json::json!({
            "id": "1",
            "roomId": 1,
            "type": "entry",
            "username": "u",
            "content": "进入了直播间",
            "timestamp": 1,
            "uid": 1,
            "color": 0,
            "guardLevel": 0,
            "isAdmin": false,
            "dmType": 0
        }))
        .expect("event");
        assert_eq!(compact_event(&event)["type"], "enter");

        let sc: crate::models::message::DanmakuEvent = serde_json::from_value(serde_json::json!({
            "id": "2",
            "roomId": 1,
            "type": "superChat",
            "username": "u",
            "content": "SC",
            "timestamp": 1,
            "uid": 1,
            "color": 0,
            "guardLevel": 0,
            "isAdmin": false,
            "dmType": 0
        }))
        .expect("event");
        assert_eq!(compact_event(&sc)["type"], "super_chat");
    }
}
