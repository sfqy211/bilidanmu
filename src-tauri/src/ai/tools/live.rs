//! 直播间上下文工具：AI 理解"现在直播间在发生什么"的核心入口。

use super::args;
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
    let gift_limit = args::capped(raw, "giftLimit", 20, 0, 200) as usize;
    let include_activity = args::bool_or(raw, "includeActivity", false);

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
            .map(compact_event)
            .collect(),
        _ => context
            .recent_danmaku(limit)
            .into_iter()
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

/// 事件压缩成模型友好的形状：去掉 UI 专用字段（颜色、背景图、表情选项等），
/// 保留语义字段。原始字段对模型是噪音，还会吃 token。
fn compact_event(event: &crate::models::message::DanmakuEvent) -> serde_json::Value {
    let mut value = serde_json::json!({
        "type": event.event_type,
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
    value
}
