use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::settings_store;
use crate::stt::SttManager;
use crate::AppState;

/// Get the base directory for STT models: {app_data_dir}/models/stt/
fn get_stt_base_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取数据目录失败: {e}"))?;
    Ok(data_dir.join("models").join("stt"))
}

/// Get the model directory for a given model ID.
pub fn get_model_dir(app: &tauri::AppHandle, model_id: &str) -> Result<String, String> {
    // Sanitize model_id against path traversal (#5)
    if model_id.contains("..") || model_id.contains('/') || model_id.contains('\\') {
        return Err(format!("Invalid model ID: {model_id}"));
    }

    let model_path = get_stt_base_dir(app)?.join(model_id);

    if !model_path.exists() {
        return Err(format!(
            "STT 模型目录不存在: {}",
            model_path.display()
        ));
    }

    let path_str = model_path.to_string_lossy().to_string();
    // Strip Windows extended-length prefix (\\?\) which sherpa-onnx may not handle
    let path_str = path_str.strip_prefix("\\\\?\\").unwrap_or(&path_str);
    Ok(path_str.to_string())
}

/// Get the STT model base directory path (for display in settings).
#[tauri::command]
pub fn get_stt_model_dir(app: tauri::AppHandle) -> Result<String, String> {
    let base = get_stt_base_dir(&app)?;
    // Auto-create the directory so users know where to put models
    std::fs::create_dir_all(&base)
        .map_err(|e| format!("创建模型目录失败: {e}"))?;
    let path_str = base.to_string_lossy().to_string();
    let path_str = path_str.strip_prefix("\\\\?\\").unwrap_or(&path_str);
    Ok(path_str.to_string())
}

/// Open the STT model directory in the system file explorer.
#[tauri::command]
pub async fn open_stt_model_dir(app: tauri::AppHandle) -> Result<(), String> {
    let base = get_stt_base_dir(&app)?;
    std::fs::create_dir_all(&base)
        .map_err(|e| format!("创建模型目录失败: {e}"))?;
    app.opener()
        .open_path(base.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("打开目录失败: {e}"))?;
    Ok(())
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

    // Stop current pipeline if running — remember whether it was active (#4)
    let mut manager_lock = state.stt_manager.lock().await;
    let was_running = manager_lock.is_some();
    if let Some(mut manager) = manager_lock.take() {
        manager.stop().await?;
    }

    // Update settings
    let mut settings = settings_store::load_settings(&app).map_err(|e| format!("读取设置失败: {e}"))?;
    settings.stt.model_id = model_id;
    settings_store::save_settings(&app, &settings).map_err(|e| format!("保存设置失败: {e}"))?;

    // Only restart pipeline if it was previously running (#4)
    if was_running {
        let model_dir = get_model_dir(&app, &settings.stt.model_id)?;
        let stream_proxy = state.stream_proxy.clone();
        let manager = SttManager::start(model_dir, app, stream_proxy).await?;
        *manager_lock = Some(manager);
    }

    log::info!("STT model switched (was_running={was_running})");
    Ok(())
}
