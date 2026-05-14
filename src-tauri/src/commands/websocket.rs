use crate::commands::build_api_client;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn connect_danmaku_stream(
    app: tauri::AppHandle,
    room_id: u64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential.clone(), &state)?;

    let mut ws_client = state.ws_client.lock().await;
    let client = ws_client.get_or_insert_with(crate::bili::ws_client::DanmakuWsClient::new);
    client.connect(app, api, room_id, credential).await
}

#[tauri::command]
pub async fn disconnect_danmaku_stream(state: State<'_, AppState>) -> Result<(), String> {
    let mut ws_client = state.ws_client.lock().await;
    if let Some(client) = ws_client.as_mut() {
        client.disconnect().await;
    }
    Ok(())
}
