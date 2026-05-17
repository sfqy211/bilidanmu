use tauri::{Manager, State};

use crate::settings_store;
use crate::stt::SttManager;
use crate::AppState;

/// Get the model directory for a given model ID.
fn get_model_dir(app: &tauri::AppHandle, model_id: &str) -> Result<String, String> {
    // Models are stored relative to the app resource directory
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("获取资源目录失败: {e}"))?;

    let model_path = resource_dir.join("models").join("stt").join(model_id);

    if !model_path.exists() {
        return Err(format!(
            "STT 模型目录不存在: {}",
            model_path.display()
        ));
    }

    Ok(model_path.to_string_lossy().to_string())
}

/// Start the STT pipeline.
#[tauri::command]
pub async fn start_stt(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut manager_lock = state.stt_manager.lock().await;
    // Stop any existing pipeline (e.g., if model was changed in settings while running)
    if let Some(mut old_manager) = manager_lock.take() {
        let _ = old_manager.stop().await;
    }

    // Read model_id from settings
    let settings = settings_store::load_settings(&app).map_err(|e| format!("读取设置失败: {e}"))?;
    let model_dir = get_model_dir(&app, &settings.stt.model_id)?;
    log::info!("start_stt: model_id={}, dir={}", settings.stt.model_id, model_dir);

    let stream_proxy = state.stream_proxy.clone();
    let manager = SttManager::start(model_dir, app, stream_proxy).await?;
    *manager_lock = Some(manager);

    log::info!("STT pipeline started");
    Ok(())
}

/// Stop the STT pipeline.
#[tauri::command]
pub async fn stop_stt(state: State<'_, AppState>) -> Result<(), String> {
    let mut manager_lock = state.stt_manager.lock().await;
    if let Some(mut manager) = manager_lock.take() {
        manager.stop().await?;
        log::info!("STT pipeline stopped");
    }
    Ok(())
}

/// Switch to a different STT model.
#[tauri::command]
pub async fn switch_stt_model(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    model_id: String,
) -> Result<(), String> {
    // Validate model directory exists
    let _model_dir = get_model_dir(&app, &model_id)?;

    // Stop current pipeline if running
    let mut manager_lock = state.stt_manager.lock().await;
    if let Some(mut manager) = manager_lock.take() {
        manager.stop().await?;
    }

    // Update settings
    let mut settings = settings_store::load_settings(&app).map_err(|e| format!("读取设置失败: {e}"))?;
    settings.stt.model_id = model_id;
    settings_store::save_settings(&app, &settings).map_err(|e| format!("保存设置失败: {e}"))?;

    // Start new pipeline
    let model_dir = get_model_dir(&app, &settings.stt.model_id)?;
    let stream_proxy = state.stream_proxy.clone();
    let manager = SttManager::start(model_dir, app, stream_proxy).await?;
    *manager_lock = Some(manager);

    log::info!("STT model switched");
    Ok(())
}
