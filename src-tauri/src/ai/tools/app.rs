//! 应用级只读工具：状态汇总。

use crate::ai::spec::ToolError;
use crate::ai::tools::settings;
use crate::AppState;
use tauri::Manager;

pub async fn get_status(
    app: &tauri::AppHandle,
    state: &AppState,
) -> Result<serde_json::Value, ToolError> {
    let credential = state.credential.lock().await.clone();
    let sending = state.sending_credential.lock().await.clone();
    let active_account_id = state
        .active_account_id
        .lock()
        .map(|value| value.clone())
        .unwrap_or(None);
    let account_count = state
        .credentials
        .lock()
        .map(|map| map.len())
        .unwrap_or(0);

    let current_room = crate::selections_store::load_values(
        state,
        &["currentRoomId".to_string()],
    )
    .ok()
    .and_then(|mut map| map.remove("currentRoomId"))
    .and_then(|value| value.as_u64());

    let live = state
        .live_context
        .lock()
        .map(|context| {
            let in_room = context.room_id;
            let connected = context.connected;
            let title = context.title.clone();
            drop(context);
            (in_room, connected, title)
        })
        .unwrap_or((None, false, None));

    let mode = crate::ai::policy::load_mode(state);
    let mcp = crate::mcp::server::status(app);

    let settings_snapshot = settings::load(state).await?;
    let gift_send_enabled = settings_snapshot
        .get("giftSendEnabled")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);

    Ok(serde_json::json!({
        "appVersion": env!("CARGO_PKG_VERSION"),
        "loggedIn": credential.is_some(),
        "activeAccountId": active_account_id,
        "accountCount": account_count,
        "sendingAccountId": sending
            .as_ref()
            .and_then(|credential| credential.dede_user_id.clone()),
        "currentRoomId": current_room,
        "live": {
            "roomId": live.0,
            "wsConnected": live.1,
            "title": live.2,
        },
        "giftSendEnabled": gift_send_enabled,
        "permissionMode": mode.as_str(),
        "permissionModeLabel": mode.label(),
        "mcp": {
            "running": mcp.running,
            "endpoint": mcp.endpoint,
            "port": mcp.port,
            "error": mcp.error,
        },
        "mockMode": crate::bili::mock::is_enabled(),
    }))
}

/// 显式触发一次房间列表刷新（AI 侧有时需要拿到最新标题/封面）
pub async fn refresh_rooms(
    app: &tauri::AppHandle,
    _state: &AppState,
) -> Result<serde_json::Value, ToolError> {
    crate::commands::room::refresh_all_rooms(app.clone()).await;
    Ok(serde_json::json!({ "refreshed": true }))
}

/// 让主窗口显示出来（AI 完成某事后把界面叫回来的入口）
pub async fn reveal_main_window(
    app: &tauri::AppHandle,
    _state: &AppState,
) -> Result<serde_json::Value, ToolError> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        Ok(serde_json::json!({ "shown": true }))
    } else {
        Ok(serde_json::json!({ "shown": false }))
    }
}
