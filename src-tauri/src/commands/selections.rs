use crate::selections_store;
use crate::{tray, AppState};
use tauri::State;

#[tauri::command]
pub async fn load_selections(
    state: State<'_, AppState>,
    keys: Vec<String>,
) -> Result<serde_json::Value, String> {
    let result = selections_store::load_values(state.inner(), &keys)?;
    Ok(serde_json::Value::Object(result))
}

#[tauri::command]
pub async fn save_selections(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    entries: serde_json::Value,
) -> Result<(), String> {
    let map = entries
        .as_object()
        .ok_or_else(|| "entries 必须是对象".to_string())?;

    selections_store::save_values(state.inner(), map)?;

    // currentRoomId 变更时刷新托盘
    if map.contains_key("currentRoomId") {
        let _ = tray::refresh_tray(&app);
    }

    Ok(())
}
