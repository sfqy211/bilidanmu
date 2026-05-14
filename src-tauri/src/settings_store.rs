use crate::models::settings::Settings;
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "settings.json";
const STORE_KEY: &str = "settings";

pub fn load_settings(app: &tauri::AppHandle) -> Result<Settings, String> {
    let store = app
        .store_builder(STORE_FILE)
        .build()
        .map_err(|error| format!("创建设置存储失败: {error}"))?;

    let Some(value) = store.get(STORE_KEY) else {
        return Ok(Settings::default());
    };

    serde_json::from_value(value).map_err(|error| format!("读取设置失败: {error}"))
}

pub fn save_settings(app: &tauri::AppHandle, settings: &Settings) -> Result<(), String> {
    let store = app
        .store_builder(STORE_FILE)
        .build()
        .map_err(|error| format!("创建设置存储失败: {error}"))?;

    store.set(
        STORE_KEY,
        serde_json::to_value(settings).map_err(|error| format!("序列化设置失败: {error}"))?,
    );

    store
        .save()
        .map_err(|error| format!("保存设置失败: {error}"))?;

    Ok(())
}
