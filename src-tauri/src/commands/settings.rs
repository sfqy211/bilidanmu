use tauri::State;

use crate::models::settings::Settings;
use crate::settings_store;
use crate::stt::SttManager;
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

    // If STT model changed, restart the pipeline so the user doesn't have
    // to manually restart (#6). The old pipeline is stopped and a new one
    // is started with the updated model.
    if model_changed {
        let stt_manager = state.stt_manager.clone();
        let app_clone = app.clone();
        let stream_proxy = state.stream_proxy.clone();
        tokio::spawn(async move {
            // Stop existing pipeline
            let was_running = {
                let mut manager_lock = stt_manager.lock().await;
                if let Some(mut manager) = manager_lock.take() {
                    log::info!("STT model changed, stopping current pipeline");
                    let _ = manager.stop().await;
                    true
                } else {
                    false
                }
            };

            // Restart if it was running
            if was_running {
                let restart_settings = settings_store::load_settings(&app_clone).ok();
                if let Some(s) = restart_settings {
                    let model_id = s.stt.model_id.clone();
                    // Reuse get_model_dir to get path traversal validation (#5)
                    match super::stt::get_model_dir(&app_clone, &model_id) {
                        Ok(model_dir) => {
                            match SttManager::start(
                                model_dir,
                                app_clone.clone(),
                                stream_proxy,
                            ).await {
                                Ok(manager) => {
                                    let mut manager_lock = stt_manager.lock().await;
                                    *manager_lock = Some(manager);
                                    log::info!("STT pipeline restarted with new model: {model_id}");
                                }
                                Err(e) => log::error!("Failed to restart STT pipeline: {e}"),
                            }
                        }
                        Err(e) => log::error!("STT restart: invalid model dir: {e}"),
                    }
                }
            }
        });
    }

    Ok(())
}
