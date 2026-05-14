use crate::models::settings::Settings;
use crate::settings_store;

#[tauri::command]
pub async fn get_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    settings_store::load_settings(&app)
}

#[tauri::command]
pub async fn update_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    settings_store::save_settings(&app, &settings)
}
