use tauri::State;

use crate::models::settings::Settings;
use crate::settings_store;
use crate::AppState;

#[tauri::command]
pub async fn get_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    settings_store::load_settings(&app)
}

#[tauri::command]
pub async fn update_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), String> {
    // Check if STT model changed while pipeline is running
    let old_settings = settings_store::load_settings(&app).ok();
    let model_changed = old_settings
        .as_ref()
        .map(|s| s.stt.model_id != settings.stt.model_id)
        .unwrap_or(false);

    settings_store::save_settings(&app, &settings)?;

    // If STT model changed, stop the current pipeline in the background.
    // Don't start a new one here (model loading is slow).
    // The next start_stt call will pick up the new model.
    if model_changed {
        let stt_manager = state.stt_manager.clone();
        tokio::spawn(async move {
            let mut manager_lock = stt_manager.lock().await;
            if let Some(mut manager) = manager_lock.take() {
                log::info!("STT model changed, stopping current pipeline");
                let _ = manager.stop().await;
            }
        });
    }

    Ok(())
}
