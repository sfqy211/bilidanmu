use crate::commands::build_api_client;
use crate::models::response::BiliResponse;
use crate::AppState;
use tauri::State;

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
    color: Option<u32>,
    mode: Option<u32>,
    dm_type: Option<u32>,
    state: State<'_, AppState>,
) -> Result<BiliResponse, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state)?;
    let emoticon_options = serde_json::json!({
        "emoticon_unique": emoticon_unique,
    })
    .to_string();

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
    _room_id: u64,
    _messages: Vec<String>,
    _interval_ms: u64,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn stop_loop_send() -> Result<(), String> {
    Ok(())
}
