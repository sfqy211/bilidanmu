use crate::commands::build_api_client;
use crate::models::response::BiliResponse;
use crate::AppState;
use tauri::Emitter;
use tauri::Manager;
use tauri::State;
use tokio::sync::oneshot;
use tokio::time::{sleep, Duration};

#[tauri::command]
pub async fn send_danmaku(
    room_id: u64,
    msg: String,
    color: Option<u32>,
    mode: Option<u32>,
    dm_type: Option<u32>,
    state: State<'_, AppState>,
) -> Result<BiliResponse, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state)?;
    api.send_danmaku(room_id, &msg, color, mode, dm_type.unwrap_or(0), None)
        .await
}

#[tauri::command]
pub async fn send_emoticon(
    room_id: u64,
    emoticon_unique: String,
    emoticon_options: Option<String>,
    color: Option<u32>,
    mode: Option<u32>,
    dm_type: Option<u32>,
    state: State<'_, AppState>,
) -> Result<BiliResponse, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state)?;
    let emoticon_options = emoticon_options.unwrap_or_else(|| {
        serde_json::json!({
            "emoticon_unique": emoticon_unique,
        })
        .to_string()
    });

    api.send_danmaku(
        room_id,
        &emoticon_unique,
        color,
        mode,
        dm_type.unwrap_or(1),
        Some(emoticon_options),
    )
    .await
}

/// 单条自动发送条目
#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AutoSendEntry {
    pub message: String,
    /// dm_type: 0=文字, 1=表情
    pub dm_type: u32,
    /// 表情模式下的 emoticon_options JSON
    pub emoticon_options: Option<String>,
}

#[tauri::command]
pub async fn start_auto_send(
    app: tauri::AppHandle,
    room_id: u64,
    entries: Vec<AutoSendEntry>,
    interval_ms: u64,
    time_limit_secs: Option<u64>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if room_id == 0 {
        return Err("room_id 不能为空".to_string());
    }

    if entries.is_empty() {
        return Err("自动发送内容不能为空".to_string());
    }

    let interval_ms = interval_ms.max(300);
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state)?;

    let mut auto_sender = state.auto_sender.lock().await;
    if auto_sender.shutdown_tx.is_some() {
        return Err("自动发送已在运行中".to_string());
    }

    let (shutdown_tx, mut shutdown_rx) = oneshot::channel();
    auto_sender.shutdown_tx = Some(shutdown_tx);
    drop(auto_sender);

    // 给待处理的 stop_auto_send 调用一个执行窗口，避免刚启动就被外部停止
    tokio::task::yield_now().await;

    tokio::spawn(async move {
        let mut index = 0usize;
        let start_time = std::time::Instant::now();
        let time_limit = time_limit_secs
            .filter(|&secs| secs > 0)
            .map(Duration::from_secs);

        loop {
            // 检查时间限制
            if let Some(limit) = time_limit {
                if start_time.elapsed() >= limit {
                    let state = app.state::<AppState>();
                    {
                        let mut sender = state.auto_sender.lock().await;
                        sender.shutdown_tx = None;
                    }
                    let _ = app.emit(
                        "auto-send-stopped",
                        serde_json::json!({"reason": "time_limit"}),
                    );
                    return;
                }
            }

            let entry = entries[index % entries.len()].clone();
            let result = api
                .send_danmaku(
                    room_id,
                    &entry.message,
                    None,
                    None,
                    entry.dm_type,
                    entry.emoticon_options.clone(),
                )
                .await;

            match result {
                Ok(_) => {
                    let _ = app.emit(
                        "auto-send-tick",
                        serde_json::json!({
                            "roomId": room_id,
                            "message": entry.message,
                            "dmType": entry.dm_type,
                            "index": index,
                        }),
                    );
                }
                Err(error) => {
                    let _ = app.emit(
                        "auto-send-error",
                        serde_json::json!({
                            "roomId": room_id,
                            "message": entry.message,
                            "dmType": entry.dm_type,
                            "index": index,
                            "error": error,
                        }),
                    );
                    break;
                }
            }

            index = index.saturating_add(1);

            tokio::select! {
                _ = sleep(Duration::from_millis(interval_ms)) => {
                    // sleep 后再检查时间限制，避免限制到期后多发一条
                    if let Some(limit) = time_limit {
                        if start_time.elapsed() >= limit {
                            let state = app.state::<AppState>();
                            {
                                let mut sender = state.auto_sender.lock().await;
                                sender.shutdown_tx = None;
                            }
                            let _ = app.emit(
                                "auto-send-stopped",
                                serde_json::json!({"reason": "time_limit"}),
                            );
                            return;
                        }
                    }
                }
                _ = &mut shutdown_rx => {
                    let _ = app.emit("auto-send-stopped", serde_json::json!({"reason": "manual"}));
                    return;
                }
            }
        }

        {
            let state = app.state::<AppState>();
            let mut sender = state.auto_sender.lock().await;
            sender.shutdown_tx = None;
        }
        let _ = app.emit(
            "auto-send-stopped",
            serde_json::json!({"reason": "error"}),
        );
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_auto_send(state: State<'_, AppState>) -> Result<(), String> {
    let mut auto_sender = state.auto_sender.lock().await;
    if let Some(shutdown_tx) = auto_sender.shutdown_tx.take() {
        let _ = shutdown_tx.send(());
    }
    Ok(())
}
