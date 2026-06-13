use tauri::Manager;

/// 用系统文件管理器打开日志目录
#[tauri::command]
pub async fn open_log_dir(app: tauri::AppHandle) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("获取日志目录失败: {e}"))?;

    if !log_dir.exists() {
        return Err("日志目录不存在".to_string());
    }

    open::that(&log_dir).map_err(|e| format!("打开日志目录失败: {e}"))
}
