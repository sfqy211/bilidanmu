use crate::ingest::{IngestConfig, IngestStats};
use crate::AppState;
use tauri::State;

/// 读取当前上报状态（是否启用、已连接、队列长度、已发送/丢弃条数）。
#[tauri::command]
pub async fn ingest_stats(state: State<'_, AppState>) -> Result<IngestStats, String> {
    Ok(state.ingest.stats().await)
}

/// 测试中心连接：用给定配置调用 /api/ingest/whoami 验证地址与 Token。
#[tauri::command]
pub async fn ingest_test_connection(
    state: State<'_, AppState>,
    center_url: String,
    node_token: String,
    node_id: String,
) -> Result<serde_json::Value, String> {
    let cfg = IngestConfig {
        center_url,
        node_token,
        node_id,
    };
    state.ingest.test_connection(cfg).await
}

/// 应用上报配置（设置页保存时调用）。enabled=false 会清空队列并结束会话。
#[tauri::command]
pub async fn ingest_apply_config(
    state: State<'_, AppState>,
    enabled: bool,
    center_url: String,
    node_token: String,
    node_id: String,
) -> Result<(), String> {
    let cfg = if enabled {
        Some(IngestConfig {
            center_url,
            node_token,
            node_id,
        })
    } else {
        None
    };
    state.ingest.apply_config(cfg).await;
    Ok(())
}

/// 手动结束当前上报会话（例如切换直播间前）。
#[tauri::command]
pub async fn ingest_leave_session(state: State<'_, AppState>) -> Result<(), String> {
    state.ingest.leave_session().await;
    Ok(())
}
