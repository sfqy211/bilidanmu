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

#[tauri::command]
pub async fn start_loop_send(
    app: tauri::AppHandle,
    room_id: u64,
    messages: Vec<String>,
    interval_ms: u64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if room_id == 0 {
        return Err("room_id 不能为空".to_string());
    }

    if messages.is_empty() {
        return Err("循环发送内容不能为空".to_string());
    }

    let interval_ms = interval_ms.max(300);
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state)?;

    let mut loop_sender = state.loop_sender.lock().await;
    if loop_sender.shutdown_tx.is_some() {
        return Err("循环发送已在运行中".to_string());
    }

    let (shutdown_tx, mut shutdown_rx) = oneshot::channel();
    loop_sender.shutdown_tx = Some(shutdown_tx);
    drop(loop_sender);

    tokio::spawn(async move {
        let mut index = 0usize;

        loop {
            let message = messages[index % messages.len()].clone();
            let result = api.send_danmaku(room_id, &message, None, None, 0, None).await;

            match result {
                Ok(_) => {
                    let _ = app.emit(
                        "loop-send-tick",
                        serde_json::json!({
                            "roomId": room_id,
                            "message": message,
                            "index": index,
                        }),
                    );
                }
                Err(error) => {
                    let _ = app.emit(
                        "loop-send-error",
                        serde_json::json!({
                            "roomId": room_id,
                            "message": message,
                            "index": index,
                            "error": error,
                        }),
                    );
                    break;
                }
            }

            index = index.saturating_add(1);

            tokio::select! {
                _ = sleep(Duration::from_millis(interval_ms)) => {}
                _ = &mut shutdown_rx => {
                    let _ = app.emit("loop-send-stopped", serde_json::json!({"reason": "manual"}));
                    return;
                }
            }
        }

        let state = app.state::<AppState>();
        if let Ok(mut loop_sender) = state.loop_sender.try_lock() {
            loop_sender.shutdown_tx = None;
        }
        let _ = app.emit("loop-send-stopped", serde_json::json!({"reason": "error"}));
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_loop_send(state: State<'_, AppState>) -> Result<(), String> {
    let mut loop_sender = state.loop_sender.lock().await;
    if let Some(shutdown_tx) = loop_sender.shutdown_tx.take() {
        let _ = shutdown_tx.send(());
    }
    Ok(())
}
