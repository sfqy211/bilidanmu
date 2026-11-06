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
use tauri::Manager;

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

/// 循环发送最多允许的条目数：再多就是刷屏了，拦下来。
const MAX_AUTO_ENTRIES: usize = 20;

/// 用户设置里的最小发送间隔（毫秒）。循环发送不允许比它更快。
fn min_user_send_interval_ms(state: &AppState) -> u64 {
    crate::settings_store::load_settings(state)
        .ok()
        .map(|settings| (settings.send_interval.min * 1000.0).round() as u64)
        .unwrap_or(0)
}

/// 启动循环发送：复用桌面端「自动发送」的同一个后台任务。
///
/// 与逐条 `danmaku_send` 的差别：一次确认覆盖整段循环，节奏由 Rust 定时器控制，
/// 不依赖模型往返；代价是这些条目不走 `send_queue`，所以这里把间隔抬到用户
/// 设置的最小发送间隔，避免 AI 绕过限流刷屏。
pub async fn auto_send_start(
    app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let room_id = resolve_room(raw, state)?;
    if !logged_in(state).await {
        return Err(ToolError::not_logged_in());
    }
    if room_id == crate::bili::mock::MOCK_ROOM_ID && crate::bili::mock::is_enabled() {
        return Ok(serde_json::json!({
            "started": false,
            "roomId": room_id,
            "mock": true,
            "note": "虚拟直播间不真实发送，循环未启动",
        }));
    }

    let entries_raw = raw
        .get("entries")
        .and_then(|value| value.as_array())
        .ok_or_else(|| {
            ToolError::invalid_args("entries 必须是数组").with_hint(
                "每项形如 {\"message\":\"666\",\"dmType\":0}；表情用 dmType=1 并给出 emoticonOptions",
            )
        })?;
    if entries_raw.is_empty() {
        return Err(ToolError::invalid_args("entries 不能为空"));
    }
    if entries_raw.len() > MAX_AUTO_ENTRIES {
        return Err(ToolError::invalid_args(format!(
            "entries 最多 {MAX_AUTO_ENTRIES} 条，当前 {} 条",
            entries_raw.len()
        ))
        .with_hint("循环发送会轮播这些文案，不需要准备很多条"));
    }

    let mut entries = Vec::with_capacity(entries_raw.len());
    for (index, entry) in entries_raw.iter().enumerate() {
        let message = entry
            .get("message")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .unwrap_or("");
        if message.is_empty() {
            return Err(ToolError::invalid_args(format!(
                "entries[{index}].message 不能为空"
            )));
        }
        let dm_type = entry
            .get("dmType")
            .and_then(|value| value.as_u64())
            .unwrap_or(0);
        if dm_type > 1 {
            return Err(ToolError::invalid_args(format!(
                "entries[{index}].dmType 只能是 0（文字）或 1（表情）"
            )));
        }
        if dm_type == 0 && message.chars().count() > 20 {
            return Err(ToolError::invalid_args(format!(
                "entries[{index}] 文本 {} 字，超过 B 站 20 字上限",
                message.chars().count()
            )));
        }
        // 表情条目缺 options 时按命令层同样的约定兜底
        let emoticon_options = if dm_type == 1 {
            Some(
                entry
                    .get("emoticonOptions")
                    .and_then(|value| value.as_str())
                    .map(str::to_string)
                    .unwrap_or_else(|| {
                        serde_json::json!({ "emoticon_unique": message }).to_string()
                    }),
            )
        } else {
            None
        };
        entries.push(crate::commands::danmaku::AutoSendEntry {
            message: message.to_string(),
            dm_type: dm_type as u32,
            emoticon_options,
        });
    }

    let requested_interval = args::opt_u64(raw, "intervalMs").unwrap_or(3000);
    let floor = min_user_send_interval_ms(state);
    let interval_ms = requested_interval.max(floor).max(300);
    let time_limit_secs = args::opt_u64(raw, "timeLimitSecs").filter(|secs| *secs > 0);

    let entry_count = entries.len();
    crate::commands::danmaku::start_auto_send(
        app.clone(),
        room_id,
        entries,
        interval_ms,
        time_limit_secs,
        app.state::<AppState>(),
    )
    .await
    .map_err(classify_business_error)?;

    Ok(serde_json::json!({
        "started": true,
        "roomId": room_id,
        "entryCount": entry_count,
        "intervalMs": interval_ms,
        "intervalClamped": interval_ms > requested_interval,
        "timeLimitSecs": time_limit_secs,
        "note": "循环在 Rust 后台运行，与模型会话无关；停用 auto_send_stop，状态用 auto_status",
    }))
}

/// 停止循环发送。
pub async fn auto_send_stop(
    app: &tauri::AppHandle,
    _state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    crate::commands::danmaku::stop_auto_send(app.state::<AppState>())
        .await
        .map_err(classify_business_error)?;
    Ok(serde_json::json!({ "stopped": true }))
}

/// 启动自动点赞：分批点到 `targetTotal`，到量自动停。
pub async fn auto_like_start(
    app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let room_id = resolve_room(raw, state)?;
    let target_total = args::capped(raw, "targetTotal", 100, 1, 1000) as u32;
    let batch_size = args::capped(raw, "batchSize", 20, 1, 100) as u32;
    let interval_ms = args::opt_u64(raw, "intervalMs").unwrap_or(5000).max(500);

    // 主播 uid 优先取参数，其次从已保存房间记录（与 danmaku_like 一致）
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
            "started": false,
            "roomId": room_id,
            "mock": true,
            "note": "虚拟直播间不真实发送，自动点赞未启动",
        }));
    }

    crate::commands::danmaku::start_auto_like(
        app.clone(),
        room_id,
        anchor_id,
        target_total,
        batch_size,
        interval_ms,
        app.state::<AppState>(),
    )
    .await
    .map_err(classify_business_error)?;

    Ok(serde_json::json!({
        "started": true,
        "roomId": room_id,
        "anchorId": anchor_id,
        "targetTotal": target_total,
        "batchSize": batch_size,
        "intervalMs": interval_ms,
        "note": "到量后自动停止；中途可用 auto_like_stop 手动停，auto_status 查看是否还在跑",
    }))
}

/// 停止自动点赞。
pub async fn auto_like_stop(
    app: &tauri::AppHandle,
    _state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    crate::commands::danmaku::stop_auto_like(app.state::<AppState>())
        .await
        .map_err(classify_business_error)?;
    Ok(serde_json::json!({ "stopped": true }))
}

/// 后台任务状态：循环发送 / 自动点赞是否还在跑。
pub async fn auto_status(
    _app: &tauri::AppHandle,
    state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let auto_send_running = state.auto_sender.lock().await.shutdown_tx.is_some();
    let auto_like_running = state.auto_like.lock().await.shutdown_tx.is_some();

    Ok(serde_json::json!({
        "autoSendRunning": auto_send_running,
        "autoLikeRunning": auto_like_running,
    }))
}

async fn logged_in(state: &AppState) -> bool {
    state.credential.lock().await.is_some()
}
