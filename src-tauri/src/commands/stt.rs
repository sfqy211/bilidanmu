use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::settings_store;
use crate::stt::SttManager;
use crate::AppState;

/// Get the base directory for STT models。设置了自定义模型目录（stt.customModelDir）
/// 时优先使用，否则回退默认 {app_data_dir}/models/stt/
pub(crate) fn get_stt_base_dir(
    app: &tauri::AppHandle,
    state: &AppState,
) -> Result<std::path::PathBuf, String> {
    let custom = settings_store::load_settings(state)
        .ok()
        .and_then(|settings| settings.stt.custom_model_dir)
        .map(|dir| dir.trim().to_string())
        .filter(|dir| !dir.is_empty());
    if let Some(dir) = custom {
        return Ok(std::path::PathBuf::from(dir));
    }
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取数据目录失败: {e}"))?;
    Ok(data_dir.join("models").join("stt"))
}

/// 模型目录的 meta 标记是否为离线类型（需 VAD 切句）。
fn is_offline_model(model_dir: &std::path::Path) -> bool {
    std::fs::read_to_string(model_dir.join("model.meta.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|json| json.get("kind").and_then(|k| k.as_str()).map(|s| s.to_string()))
        .map(|kind| matches!(kind.as_str(), "sensevoice" | "firered" | "qwen3"))
        .unwrap_or(false)
}

/// Get the model directory for a given model ID.
pub fn get_model_dir(
    app: &tauri::AppHandle,
    state: &AppState,
    model_id: &str,
) -> Result<String, String> {
    // Sanitize model_id against path traversal (#5)
    if model_id.contains("..") || model_id.contains('/') || model_id.contains('\\') {
        return Err(format!("Invalid model ID: {model_id}"));
    }

    let model_path = get_stt_base_dir(app, state)?.join(model_id);

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
pub fn get_stt_model_dir(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let base = get_stt_base_dir(&app, state.inner())?;
    // Auto-create the directory so users know where to put models
    std::fs::create_dir_all(&base)
        .map_err(|e| format!("创建模型目录失败: {e}"))?;
    let path_str = base.to_string_lossy().to_string();
    let path_str = path_str.strip_prefix("\\\\?\\").unwrap_or(&path_str);
    Ok(path_str.to_string())
}

/// List available STT models by scanning the model directory.
/// Returns model IDs for subdirectories that contain the required files.
#[tauri::command]
pub fn list_stt_models(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let base = get_stt_base_dir(&app, state.inner())?;
    if !base.exists() {
        return Ok(Vec::new());
    }

    let mut models = Vec::new();
    for entry in std::fs::read_dir(&base).map_err(|e| format!("读取模型目录失败: {e}"))? {
        let entry = entry.map_err(|e| format!("目录条目错误: {e}"))?;
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let dir = entry.path();
        // 有效模型 = 任一 onnx + (tokens.txt / tokenizer / meta 标记任一)。
        // 流式包是 encoder/decoder/joiner 三件套，离线包（SenseVoice 等）
        // 是 model.int8.onnx、Qwen3 是四件套 + tokenizer，判定需放宽。
        let (has_onnx, has_desc) = dir.read_dir().ok().map_or((false, false), |entries| {
            let mut has_onnx = false;
            let mut has_desc = false;
            for e in entries.filter_map(|e| e.ok()) {
                let name = e.file_name().to_string_lossy().to_lowercase();
                if name.ends_with(".onnx") {
                    has_onnx = true;
                }
                if name == "tokens.txt" || name.starts_with("tokenizer") || name == "model.meta.json" {
                    has_desc = true;
                }
            }
            (has_onnx, has_desc)
        });
        if has_onnx && has_desc {
            models.push(entry.file_name().to_string_lossy().to_string());
        }
    }

    models.sort();
    Ok(models)
}

/// Open the STT model directory in the system file explorer.
#[tauri::command]
pub async fn open_stt_model_dir(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let base = get_stt_base_dir(&app, state.inner())?;
    std::fs::create_dir_all(&base)
        .map_err(|e| format!("创建模型目录失败: {e}"))?;
    app.opener()
        .open_path(base.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("打开目录失败: {e}"))?;
    Ok(())
}

/// 确保 STT 管线已启动（幂等）。`start_stt` 命令与 AI 工具共用一条路径。
pub(crate) async fn ensure_stt_pipeline(
    app: &tauri::AppHandle,
    state: &AppState,
) -> Result<(), String> {
    let mut manager_lock = state.stt_manager.lock().await;
    if manager_lock.is_some() {
        log::info!("start_stt: pipeline already running, skipping duplicate start");
        return Ok(());
    }

    // Read model_id from settings
    let settings = settings_store::load_settings(state).map_err(|e| format!("读取设置失败: {e}"))?;
    let model_dir = get_model_dir(app, state, &settings.stt.model_id)?;
    log::info!("start_stt: model_id={}, dir={}", settings.stt.model_id, model_dir);

    // 离线模型依赖 Silero VAD（下载器自动附带）；缺失时提前报错而非静默失败
    if is_offline_model(std::path::Path::new(&model_dir)) {
        let vad = std::path::Path::new(&model_dir)
            .parent()
            .map(|p| p.join(crate::commands::stt_download::VAD_DIR).join(crate::commands::stt_download::VAD_FILE));
        if let Some(vad) = vad {
            if !vad.exists() {
                return Err(format!(
                    "离线识别缺少 VAD 模型（{}），请在设置中重新下载该离线模型",
                    vad.display()
                ));
            }
        }
    }

    let stream_proxy = state.stream_proxy.clone();
    let manager = SttManager::start(model_dir, app.clone(), stream_proxy).await?;
    *manager_lock = Some(manager);

    log::info!("STT pipeline started");
    Ok(())
}

/// 停止 STT 管线（幂等）。`stop_stt` 命令与 AI 工具共用一条路径。
pub(crate) async fn stop_stt_pipeline(state: &AppState) -> Result<(), String> {
    let mut manager_lock = state.stt_manager.lock().await;
    if let Some(mut manager) = manager_lock.take() {
        manager.stop().await?;
        log::info!("STT pipeline stopped");
    }
    Ok(())
}

/// Start the STT pipeline.
#[tauri::command]
pub async fn start_stt(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    ensure_stt_pipeline(&app, state.inner()).await
}

/// Stop the STT pipeline.
#[tauri::command]
pub async fn stop_stt(state: State<'_, AppState>) -> Result<(), String> {
    stop_stt_pipeline(state.inner()).await
}

/// Switch to a different STT model.
#[tauri::command]
pub async fn switch_stt_model(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    model_id: String,
) -> Result<(), String> {
    // Validate model directory exists
    let _model_dir = get_model_dir(&app, state.inner(), &model_id)?;

    // Stop current pipeline if running — remember whether it was active (#4)
    let mut manager_lock = state.stt_manager.lock().await;
    let was_running = manager_lock.is_some();
    if let Some(mut manager) = manager_lock.take() {
        manager.stop().await?;
    }

    // Update settings
    let mut settings = settings_store::load_settings(&state).map_err(|e| format!("读取设置失败: {e}"))?;
    settings.stt.model_id = model_id;
    settings_store::save_settings(&state, &settings).map_err(|e| format!("保存设置失败: {e}"))?;

    // Only restart pipeline if it was previously running (#4)
    if was_running {
        let model_dir = get_model_dir(&app, state.inner(), &settings.stt.model_id)?;
        let stream_proxy = state.stream_proxy.clone();
        let manager = SttManager::start(model_dir, app, stream_proxy).await?;
        *manager_lock = Some(manager);
    }

    log::info!("STT model switched (was_running={was_running})");
    Ok(())
}

/// 设置/重置自定义模型目录（dir 为 None 或空串 = 恢复默认目录）。
/// 目录不存在时自动创建；STT 管线运行中则先停止——新目录下原模型可能不存在，
/// 由用户在模型列表中重新选择后再次启用。
#[tauri::command]
pub async fn set_stt_model_dir(
    state: State<'_, AppState>,
    dir: Option<String>,
) -> Result<(), String> {
    let trimmed = dir
        .as_deref()
        .map(str::trim)
        .filter(|d| !d.is_empty())
        .map(|d| d.to_string());
    if let Some(path) = &trimmed {
        let path = std::path::Path::new(path);
        if !path.is_absolute() {
            return Err("模型目录必须是绝对路径".to_string());
        }
        std::fs::create_dir_all(path).map_err(|e| format!("创建模型目录失败: {e}"))?;
    }

    let mut settings =
        settings_store::load_settings(state.inner()).map_err(|e| format!("读取设置失败: {e}"))?;
    settings.stt.custom_model_dir = trimmed;
    settings_store::save_settings(state.inner(), &settings)
        .map_err(|e| format!("保存设置失败: {e}"))?;

    // 管线运行中：先停止，避免继续用旧目录里的模型
    let mut manager_lock = state.stt_manager.lock().await;
    if let Some(mut manager) = manager_lock.take() {
        manager.stop().await?;
        log::info!("模型目录已变更，STT 管线已停止");
    }
    Ok(())
}
