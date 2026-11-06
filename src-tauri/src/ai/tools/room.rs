//! 房间工具：列表/搜索/详情/开播状态/进出直播间。
//!
//! 进房复用 `commands::room::switch_room`，因此托盘、窗口互斥、路由切换
//! 与前端点击完全一致。

use super::{api_with_main, args};
use crate::ai::spec::ToolError;
use crate::AppState;
use tauri::Manager;

/// 已保存的房间列表（含实时开播状态合并）。
pub async fn list(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let only_live = args::bool_or(raw, "onlyLive", false);
    let rooms = crate::room_store::load_rooms(state).map_err(super::classify_business_error)?;

    // 开播状态缓存以 UID 为键，房间本身用 room_id
    let statuses = state
        .live_status
        .lock()
        .ok()
        .and_then(|value| value.clone())
        .unwrap_or_default();

    let mut items: Vec<serde_json::Value> = rooms
        .iter()
        .map(|room| {
            let status = room.uid.and_then(|uid| statuses.get(&uid));
            serde_json::json!({
                "roomId": room.room_id,
                "uid": room.uid,
                "uname": room.uname,
                "title": status
                    .map(|status| status.title.clone())
                    .filter(|title| !title.is_empty())
                    .unwrap_or_else(|| room.title.clone()),
                "isLive": status.map(|status| status.is_live).unwrap_or(false),
                "liveStartTime": status.and_then(|status| status.live_start_time),
                "lastLiveStart": room.last_live_start,
                "cover": room.cover,
            })
        })
        .filter(|item| {
            !only_live || item.get("isLive").and_then(|value| value.as_bool()).unwrap_or(false)
        })
        .collect();

    items.sort_by_key(|item| {
        let live = item.get("isLive").and_then(|value| value.as_bool()).unwrap_or(false);
        let start = item
            .get("liveStartTime")
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
        // 直播中的排前面，同为直播中则开播越早（时间戳越小）越靠前
        (!live, start)
    });

    Ok(serde_json::json!({
        "count": items.len(),
        "totalSaved": rooms.len(),
        "onlyLive": only_live,
        "rooms": items,
    }))
}

/// 搜索房间：支持房间号/链接/主播名。
pub async fn search(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let keyword = args::string(raw, "keyword")?;
    if keyword.trim().is_empty() {
        return Err(ToolError::invalid_args("keyword 不能为空"));
    }
    let mode = args::opt_string(raw, "mode").unwrap_or_else(|| "name".to_string());

    let api = api_with_main(state).await;
    let results = match mode.as_str() {
        "roomId" | "link" => {
            let room_id = keyword
                .chars()
                .filter(|ch| ch.is_ascii_digit())
                .collect::<String>()
                .parse::<u64>()
                .map_err(|_| ToolError::invalid_args(format!("无法从 {keyword} 解析房间号")))?;
            let info = api
                .get_room_info(room_id)
                .await
                .map_err(super::classify_business_error)?;
            vec![crate::models::room::SearchRoomResult::from(info)]
        }
        _ => api
            .search_rooms_by_name(keyword.trim(), 1)
            .await
            .map_err(super::classify_business_error)?,
    };

    Ok(serde_json::json!({
        "count": results.len(),
        "results": results,
    }))
}

/// 房间详情：实时查询 B 站接口，并同步本地保存的标题/封面。
pub async fn get(
    app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let room_id = args::u64_required(raw, "roomId")?;
    let info = crate::commands::room::get_room_info(
        app.clone(),
        room_id,
        app.state::<AppState>(),
    )
    .await
    .map_err(super::classify_business_error)?;
    let _ = state;
    serde_json::to_value(info).map_err(|error| ToolError::failed(format!("序列化房间信息失败: {error}")))
}

/// 已保存房间的实时开播状态。
pub async fn live_status(
    app: &tauri::AppHandle,
    state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let statuses = crate::commands::room::get_rooms_live_status(app.state::<AppState>())
        .await
        .map_err(super::classify_business_error)?;

    let rooms = crate::room_store::load_rooms(state).map_err(super::classify_business_error)?;
    let items: Vec<serde_json::Value> = rooms
        .iter()
        .map(|room| {
            let status = room.uid.and_then(|uid| statuses.get(&uid));
            serde_json::json!({
                "roomId": room.room_id,
                "uname": room.uname,
                "isLive": status.map(|status| status.is_live).unwrap_or(false),
                "title": status.map(|status| status.title.clone()).unwrap_or_default(),
                "liveStartTime": status.and_then(|status| status.live_start_time),
            })
        })
        .collect();

    Ok(serde_json::json!({ "rooms": items }))
}

/// 进入直播间：走 `switch_room`，与前端点击行为一致（含窗口互斥与托盘刷新）。
pub async fn join(
    app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let room_id = args::u64_required(raw, "roomId")?;

    // 号 0 是虚拟直播间的合法房间号，只有缺失才视为非法
    let saved = crate::room_store::load_rooms(state)
        .map_err(super::classify_business_error)?
        .into_iter()
        .find(|room| room.room_id == room_id);
    if saved.is_none() && !crate::bili::mock::is_enabled() {
        return Err(ToolError::invalid_args(format!("房间 {room_id} 不在已保存列表中"))
            .with_hint("先调用 room_search 找到房间，提示用户在 UI 里添加；本工具不直接新增保存项"));
    }

    crate::commands::room::switch_room(app.clone(), room_id, app.state::<AppState>())
        .await
        .map_err(super::classify_business_error)?;

    Ok(serde_json::json!({ "joined": true, "roomId": room_id }))
}

/// 离开直播间：走 `exit_room`，销毁弹幕窗口并回主页面。
pub async fn leave(
    app: &tauri::AppHandle,
    state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let room_id = super::current_room_id(state)
        .or_else(|| {
            crate::selections_store::load_values(state, &["currentRoomId".to_string()])
                .ok()
                .and_then(|mut map| map.remove("currentRoomId"))
                .and_then(|value| value.as_u64())
        })
        .ok_or_else(ToolError::not_in_room)?;

    crate::commands::room::exit_room(app.clone(), room_id, app.state::<AppState>())
        .await
        .map_err(super::classify_business_error)?;

    Ok(serde_json::json!({ "left": true, "roomId": room_id }))
}

/// 关注列表中正在直播的主播（需登录）。
pub async fn follow_lives(
    _app: &tauri::AppHandle,
    state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let api = api_with_main(state).await;
    let lives = api
        .get_follow_lives()
        .await
        .map_err(super::classify_business_error)?;
    Ok(serde_json::json!({ "count": lives.len(), "lives": lives }))
}
