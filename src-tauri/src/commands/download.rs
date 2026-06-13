use std::io::Write;
use tauri::{Emitter, State};

/// 下载文件到临时目录，通过事件报告进度，完成后返回文件路径
#[tauri::command]
pub async fn download_file(
    app: tauri::AppHandle,
    state: State<'_, crate::AppState>,
    url: String,
    filename: String,
) -> Result<String, String> {
    let response = state
        .proxy_client
        .get(&url)
        .timeout(std::time::Duration::from_secs(300))
        .send()
        .await
        .map_err(|e| format!("下载请求失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("下载失败: HTTP {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join(&filename);

    let mut file = std::fs::File::create(&file_path)
        .map_err(|e| format!("创建文件失败: {e}"))?;

    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_report: u64 = 0;

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(c) => c,
            Err(e) => {
                let _ = std::fs::remove_file(&file_path);
                return Err(format!("下载数据失败: {e}"));
            }
        };
        if let Err(e) = file.write_all(&chunk) {
            let _ = std::fs::remove_file(&file_path);
            return Err(format!("写入文件失败: {e}"));
        }
        downloaded += chunk.len() as u64;

        // 每 100KB 或完成时报告一次进度
        if downloaded - last_report > 102400 || downloaded == total_size {
            last_report = downloaded;
            let _ = app.emit(
                "download-progress",
                serde_json::json!({
                    "filename": filename,
                    "downloaded": downloaded,
                    "total": total_size,
                }),
            );
        }
    }

    Ok(file_path.to_string_lossy().to_string())
}

/// 用系统默认程序打开文件
#[tauri::command]
pub async fn open_file_path(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("打开文件失败: {e}"))
}
