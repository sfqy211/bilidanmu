use tauri::{Manager, State};

use crate::models::settings::Settings;
use crate::settings_store;
use crate::AppState;

/// STT is always available in this build.
#[tauri::command]
pub fn is_stt_available() -> bool {
    true
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    settings_store::load_settings(&state)
}

#[tauri::command]
pub async fn update_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), String> {
    // Check if STT model changed while pipeline is running
    let old_settings = settings_store::load_settings(&state).ok();
    let model_changed = old_settings
        .as_ref()
        .map(|s| s.stt.model_id != settings.stt.model_id)
        .unwrap_or(false);

    settings_store::save_settings(&state, &settings)?;

    // 收起条开关同步到内存镜像：吸附几何与轮询读它，不能每次读库。
    // 关掉时若窗口正处于吸附收缩态，重新计算一次几何让命中区撑开
    let dock_enabled = settings.appearance.danmaku_window.dock_enabled;
    let was_enabled = state.dock_enabled.swap(dock_enabled, std::sync::atomic::Ordering::Relaxed);
    if was_enabled != dock_enabled {
        if let Some(window) = app.get_webview_window(crate::commands::room::DANMAKU_WINDOW_LABEL) {
            crate::window_dock::refresh_collapsed_geometry(&app, &window);
        }
    }

    // 快捷键绑定可能随设置变更：全量重注册（幂等）
    crate::shortcuts::apply_shortcuts(&app);

    // If STT model changed, restart the pipeline
    if model_changed {
        let stt_manager = state.stt_manager.clone();
        let app_clone = app.clone();
        let stream_proxy = state.stream_proxy.clone();
        let new_model_id = settings.stt.model_id.clone();
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
                match super::stt::get_model_dir(&app_clone, &new_model_id) {
                    Ok(model_dir) => {
                        match crate::stt::SttManager::start(
                            model_dir,
                            app_clone,
                            stream_proxy,
                        ).await {
                            Ok(manager) => {
                                let mut manager_lock = stt_manager.lock().await;
                                *manager_lock = Some(manager);
                                log::info!("STT pipeline restarted with new model: {new_model_id}");
                            }
                            Err(e) => log::error!("Failed to restart STT pipeline: {e}"),
                        }
                    }
                    Err(e) => log::error!("STT restart: invalid model dir: {e}"),
                }
            }
        });
    }

    Ok(())
}
