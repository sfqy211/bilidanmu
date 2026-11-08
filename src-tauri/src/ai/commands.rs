//! AI 层对前端的命令：权限模式、MCP 开关、token 管理、确认应答。
//!
//! 这些命令只服务 AIPage 的管理界面；外部 AI 客户端走的是 MCP HTTP 通道，
//! 最终进 [`crate::ai::dispatch::call_tool`]。工具清单与调用记录不再走前端，
//! 记在 AI 专用日志里（见 [`crate::ai::audit`]）。

use crate::AppState;
use tauri::{Manager, State};

/// 读取权限模式
#[tauri::command]
pub async fn ai_get_permission_mode(state: State<'_, AppState>) -> Result<String, String> {
    Ok(crate::ai::policy::load_mode(state.inner()).as_str().to_string())
}

/// 切换权限模式
#[tauri::command]
pub async fn ai_set_permission_mode(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    mode: String,
) -> Result<(), String> {
    let parsed = crate::ai::policy::PermissionMode::parse(&mode);
    crate::ai::policy::save_mode(state.inner(), parsed)?;

    // 让界面上的按钮状态跟着变（设置被其它入口改动时也一致）
    use tauri::Emitter;
    let _ = app.emit("ai-permission-changed", parsed.as_str());
    Ok(())
}

/// 用户对确认请求的应答
#[tauri::command]
pub async fn ai_confirm_response(
    state: State<'_, AppState>,
    id: String,
    approved: bool,
) -> Result<bool, String> {
    let mut registry = state
        .ai_pending_confirm
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    Ok(registry.resolve(&id, approved))
}

/// MCP 服务状态（地址、端口、是否运行）
#[tauri::command]
pub async fn ai_mcp_status(app: tauri::AppHandle) -> Result<crate::mcp::McpStatus, String> {
    Ok(crate::mcp::server::status(&app))
}

/// 启动 MCP 服务
#[tauri::command]
pub async fn ai_mcp_start(app: tauri::AppHandle) -> Result<crate::mcp::McpStatus, String> {
    let status = crate::mcp::server::spawn_server(app.clone()).await?;
    crate::ai::policy::save_mcp_enabled(&app.state::<AppState>(), true)?;
    Ok(status)
}

/// 停止 MCP 服务（只置标志位，端口由进程退出时释放）
#[tauri::command]
pub async fn ai_mcp_stop(app: tauri::AppHandle) -> Result<crate::mcp::McpStatus, String> {
    let state = app.state::<AppState>();
    crate::ai::policy::save_mcp_enabled(state.inner(), false)?;
    Ok(crate::mcp::server::status(&app))
}

/// 读取 MCP token（仅本地界面使用；AIPage 提供复制按钮）
#[tauri::command]
pub async fn ai_mcp_token(app: tauri::AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();
    crate::mcp::token::ensure_token(state.inner())
}

/// 重新生成 token，旧 token 立即失效
#[tauri::command]
pub async fn ai_mcp_regenerate_token(app: tauri::AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();
    crate::mcp::token::regenerate(state.inner())
}
