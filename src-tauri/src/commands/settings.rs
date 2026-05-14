use crate::models::settings::Settings;

#[tauri::command]
pub async fn get_settings() -> Result<Settings, String> {
    Ok(Settings::default())
}

#[tauri::command]
pub async fn update_settings(_settings: Settings) -> Result<(), String> {
    Ok(())
}
