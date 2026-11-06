//! 弹幕工具：读表情包、发弹幕、点赞。
//!
//! 发送走 `send_queue`（`SendPriority::Ai`），复用用户设置里的发送间隔与频率限制；
//! 并额外做相同文本短时间去重，防止模型重复刷同一句。

use super::{api_with_main, api_with_sending, args};
use crate::ai::spec::ToolError;
use crate::ai::tools::classify_business_error;
use crate::AppState;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// 相同文本的去重窗口
const DUPLICATE_WINDOW: Duration = Duration::from_secs(20);

/// (房间号, 文本) -> 上次发送时间
static RECENT_SENDS: Mutex<Option<Vec<((u64, String), Instant)>>> = Mutex::new(None);

fn check_duplicate(room_id: u64, message: &str) -> bool {
    let mut guard = RECENT_SENDS.lock().unwrap_or_else(|error| error.into_inner());
    let entries = guard.get_or_insert_with(Vec::new);
    let now = Instant::now();
    entries.retain(|(_, at)| now.duration_since(*at) < DUPLICATE_WINDOW);
    let key = (room_id, message.to_string());
    if entries.iter().any(|(existing, _)| *existing == key) {
        return true;
    }
    entries.push((key, now));
    // 上限保护：正常用量远达不到，这里只是防止异常调用撑爆内存
    if entries.len() > 64 {
        entries.remove(0);
    }
    false
}

/// 取当前房间号：优先参数，其次直播间上下文。
fn resolve_room(raw: &serde_json::Value, state: &AppState) -> Result<u64, ToolError> {
    args::opt_u64(raw, "roomId")
        .or_else(|| super::current_room_id(state))
        .ok_or_else(ToolError::not_in_room)
}

/// 房间的表情包列表（含房间专属与全站，缓存命中时不发网络请求）。
pub async fn get_emoticons(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let room_id = resolve_room(raw, state)?;
    let account_id = super::active_account_id(state).unwrap_or_default();

    // 先看本地缓存，避免每次调用都打接口
    let cached = crate::emoticon_store::load_room_packages(state, room_id, &account_id);
    if !cached.is_empty() {
        return Ok(serde_json::json!({
            "roomId": room_id,
            "source": "cache",
            "packages": cached,
        }));
    }

    let api = api_with_main(state).await;
    let packages = api
        .get_emoticons(room_id)
        .await
        .map_err(classify_business_error)?;
    let _ = crate::emoticon_store::save_room_packages(state, room_id, &account_id, &packages);

    Ok(serde_json::json!({
        "roomId": room_id,
        "source": "network",
        "packages": packages,
    }))
}

/// 消息模板列表。
pub async fn list_templates(
    _app: &tauri::AppHandle,
    state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let templates =
        crate::message_template_store::list_templates(state).map_err(classify_business_error)?;
    Ok(serde_json::json!({ "count": templates.len(), "templates": templates }))
}

/// 新建或更新消息模板：带 id 为更新，不带为新建。
pub async fn save_template(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let title = args::string(raw, "title")?;
    let content = args::string(raw, "content")?;
    if title.trim().is_empty() || content.trim().is_empty() {
        return Err(ToolError::invalid_args("title 与 content 都不能为空"));
    }

    match args::opt_u64(raw, "id") {
        Some(id) => {
            crate::message_template_store::update_template(state, id as i64, &title, &content)
                .map_err(classify_business_error)?;
            Ok(serde_json::json!({ "updated": true, "id": id }))
        }
        None => {
            let id = crate::message_template_store::insert_template(state, &title, &content)
                .map_err(classify_business_error)?;
            Ok(serde_json::json!({ "created": true, "id": id }))
        }
    }
}

pub async fn delete_template(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let id = args::u64_required(raw, "id")?;
    crate::message_template_store::delete_template(state, id as i64)
        .map_err(classify_business_error)?;
    Ok(serde_json::json!({ "deleted": true, "id": id }))
}

/// 发送一条文字弹幕。
pub async fn send(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let room_id = resolve_room(raw, state)?;
    let message = args::string(raw, "message")?;
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err(ToolError::invalid_args("弹幕内容不能为空"));
    }
    // B 站弹幕长度上限 20 字，超出会被服务端拒绝，提前拦下给明确提示
    if trimmed.chars().count() > 20 {
        return Err(ToolError::invalid_args(format!(
            "弹幕长度 {} 超过 B 站上限 20 字",
            trimmed.chars().count()
        ))
        .with_hint("压缩文案后重试"));
    }

    if !logged_in(state).await {
        return Err(ToolError::not_logged_in());
    }

    if check_duplicate(room_id, trimmed) {
        return Err(ToolError::new(
            "DUPLICATE_MESSAGE",
            format!("{trimmed} 在 20 秒内已经发过"),
        )
        .with_hint("换一句话，或等一会再发；重复刷屏会触发风控"));
    }

    // 虚拟直播间不真实发送：mock 下直接返回成功标记
    if room_id == crate::bili::mock::MOCK_ROOM_ID && crate::bili::mock::is_enabled() {
        return Ok(serde_json::json!({
            "sent": true,
            "roomId": room_id,
            "message": trimmed,
            "mock": true,
            "note": "虚拟直播间不真实发送",
        }));
    }

    // 队列按发送间隔串行处理：复用用户设置里的节奏，防止 AI 刷屏
    let result = crate::send_queue::send_via_queue(
        state,
        room_id,
        trimmed,
        crate::send_queue::SendPriority::Ai,
        args::opt_u32(raw, "color"),
        args::opt_u32(raw, "mode"),
        0,
        None,
    )
    .await
    .map_err(classify_business_error)?;

    Ok(match result {
        crate::send_queue::SendResult::Success => serde_json::json!({
            "sent": true,
            "roomId": room_id,
            "message": trimmed,
        }),
        crate::send_queue::SendResult::Error(error) => {
            return Err(ToolError::failed(error));
        }
    })
}

/// 发送表情弹幕（`emoticonUnique` 来自 `danmaku_get_emoticons`）。
pub async fn send_emoticon(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let room_id = resolve_room(raw, state)?;
    let unique = args::string(raw, "emoticonUnique")?;
    if unique.trim().is_empty() {
        return Err(ToolError::invalid_args("emoticonUnique 不能为空"));
    }
    if !logged_in(state).await {
        return Err(ToolError::not_logged_in());
    }

    if room_id == crate::bili::mock::MOCK_ROOM_ID && crate::bili::mock::is_enabled() {
        return Ok(serde_json::json!({
            "sent": true,
            "roomId": room_id,
            "emoticonUnique": unique,
            "mock": true,
        }));
    }

    let options = args::opt_string(raw, "emoticonOptions").unwrap_or_else(|| {
        serde_json::json!({ "emoticon_unique": unique }).to_string()
    });

    let result = crate::send_queue::send_via_queue(
        state,
        room_id,
        &unique,
        crate::send_queue::SendPriority::Ai,
        None,
        None,
        1,
        Some(options),
    )
    .await
    .map_err(classify_business_error)?;

    Ok(match result {
        crate::send_queue::SendResult::Success => serde_json::json!({
            "sent": true,
            "roomId": room_id,
            "emoticonUnique": unique,
        }),
        crate::send_queue::SendResult::Error(error) => {
            return Err(ToolError::failed(error));
        }
    })
}

/// 给直播间点赞（`clickTimes` 1~100）。
pub async fn like(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let room_id = resolve_room(raw, state)?;
    let click_times = args::capped(raw, "clickTimes", 10, 1, 100) as u32;

    // 主播 uid 优先取参数，其次从已保存房间记录
    let anchor_id = match args::opt_u64(raw, "anchorId") {
        Some(uid) => uid,
        None => crate::room_store::load_rooms(state)
            .map_err(classify_business_error)?
            .into_iter()
            .find(|room| room.room_id == room_id)
            .and_then(|room| room.uid)
            .ok_or_else(|| {
                ToolError::invalid_args("拿不到主播 uid，请显式传 anchorId")
                    .with_hint("主播 uid 可从 room_get 的返回里读到")
            })?,
    };

    if !logged_in(state).await {
        return Err(ToolError::not_logged_in());
    }

    if room_id == crate::bili::mock::MOCK_ROOM_ID && crate::bili::mock::is_enabled() {
        return Ok(serde_json::json!({
            "liked": true,
            "roomId": room_id,
            "clickTimes": click_times,
            "mock": true,
        }));
    }

    let api = api_with_sending(state).await;
    let response = api
        .send_like(room_id, anchor_id, click_times)
        .await
        .map_err(classify_business_error)?;

    Ok(serde_json::json!({
        "liked": response.code == 0,
        "roomId": room_id,
        "clickTimes": click_times,
        "code": response.code,
    }))
}

async fn logged_in(state: &AppState) -> bool {
    state.credential.lock().await.is_some()
}
