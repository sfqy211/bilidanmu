#[tauri::command]
pub async fn connect_danmaku_stream(_room_id: u64) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn disconnect_danmaku_stream() -> Result<(), String> {
    Ok(())
}
