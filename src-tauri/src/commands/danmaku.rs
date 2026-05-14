#[derive(serde::Serialize)]
pub struct BiliResponse {
    pub code: i32,
    pub message: String,
}

#[tauri::command]
pub async fn send_danmaku(
    room_id: u64,
    msg: String,
    color: Option<u32>,
    mode: Option<u32>,
    dm_type: Option<u32>,
) -> Result<BiliResponse, String> {
    Ok(BiliResponse {
        code: 0,
        message: format!(
            "mock send to room {room_id}: {msg} (color={:?}, mode={:?}, dm_type={:?})",
            color, mode, dm_type
        ),
    })
}

#[tauri::command]
pub async fn send_emoticon(
    room_id: u64,
    emoticon_unique: String,
    color: Option<u32>,
    mode: Option<u32>,
    dm_type: Option<u32>,
) -> Result<BiliResponse, String> {
    Ok(BiliResponse {
        code: 0,
        message: format!(
            "mock emoticon send to room {room_id}: {emoticon_unique} (color={:?}, mode={:?}, dm_type={:?})",
            color, mode, dm_type
        ),
    })
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
