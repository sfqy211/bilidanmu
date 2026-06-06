use crate::AppState;
use rusqlite::params;
use tauri::{Manager, State};

const BILI_REFERER: &str = "https://www.bilibili.com/";
const MAX_BODY_BYTES: usize = 5 * 1024 * 1024; // 5 MB

/// Returns true if the host is a known Bilibili CDN / asset domain.
fn is_allowed_host(host: &str) -> bool {
    let h = host.to_ascii_lowercase();
    h.ends_with(".hdslb.com")
        || h.ends_with(".bilibili.com")
        || h == "hdslb.com"
        || h == "bilibili.com"
}

fn host_of(url: &str) -> Option<&str> {
    let rest = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://"))?;
    rest.split(&['/', '?', '#'][..]).next()
}

/// 从缓存加载图片
fn load_from_cache(state: &AppState, url: &str) -> Option<String> {
    crate::db::with_connection(state, |connection| {
        let result = connection.query_row(
            "SELECT data_url FROM image_cache WHERE url = ?1",
            params![url],
            |row| row.get::<_, String>(0),
        );
        Ok(result.ok())
    })
    .ok()
    .flatten()
}

/// 保存图片到缓存
fn save_to_cache(state: &AppState, url: &str, data_url: &str) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    if let Err(e) = crate::db::with_connection(state, |connection| {
        connection.execute(
            "INSERT OR REPLACE INTO image_cache (url, data_url, updated_at) VALUES (?1, ?2, ?3)",
            params![url, data_url, now],
        )
        .map_err(|e| format!("保存图片缓存失败: {e}"))?;
        Ok(())
    }) {
        log::warn!("保存图片缓存失败: {e}");
    }
}

#[tauri::command]
pub async fn proxy_image(
    url: String,
    persistent: Option<bool>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // wealth-level:// 协议：直接从 SQLite 缓存读取（启动时已预加载）
    if url.starts_with("wealth-level://") {
        return load_from_cache(state.inner(), &url)
            .ok_or_else(|| format!("荣耀等级图标未缓存: {url}"));
    }

    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err(format!("无效的图片 URL: {url}"));
    }

    let persistent = persistent.unwrap_or(false);

    // 持久模式：先查 SQLite 缓存
    if persistent {
        if let Some(cached) = load_from_cache(state.inner(), &url) {
            return Ok(cached);
        }
    }

    let host = host_of(&url).ok_or_else(|| format!("无法解析 URL 主机: {url}"))?;
    if !is_allowed_host(host) {
        return Err(format!("URL 不在白名单内: {host}"));
    }

    let response = state
        .proxy_client
        .get(&url)
        .header("Referer", BILI_REFERER)
        .send()
        .await
        .map_err(|error| format!("代理图片请求失败: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("代理图片请求失败: {}", response.status()));
    }

    let content_length = response.content_length().unwrap_or(0);
    if content_length > MAX_BODY_BYTES as u64 {
        return Err(format!(
            "图片大小超过限制: {content_length} bytes (上限 {MAX_BODY_BYTES})"
        ));
    }

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取图片数据失败: {error}"))?;

    if bytes.len() > MAX_BODY_BYTES {
        return Err(format!(
            "图片大小超过限制: {} bytes (上限 {MAX_BODY_BYTES})",
            bytes.len()
        ));
    }

    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:{content_type};base64,{encoded}");

    // 持久模式：写入 SQLite 缓存
    if persistent {
        save_to_cache(state.inner(), &url, &data_url);
    }

    Ok(data_url)
}

/// 清理图片缓存
#[tauri::command]
pub async fn clear_image_cache(state: State<'_, AppState>) -> Result<(), String> {
    crate::db::with_connection(state.inner(), |connection| {
        connection
            .execute_batch("DELETE FROM image_cache")
            .map_err(|e| format!("清理图片缓存失败: {e}"))?;
        Ok(())
    })
}

/// 预加载荣耀等级图标到 SQLite 缓存（启动时调用，仅首次执行）
pub fn preload_wealth_level_images(app: &tauri::AppHandle, state: &AppState) {
    use base64::Engine;

    // 检查是否已缓存（查 level 1 即可判断）
    let already_cached = load_from_cache(state, "wealth-level://1").is_some();
    if already_cached {
        return;
    }

    let resource_dir = match app.path().resource_dir() {
        Ok(dir) => dir,
        Err(e) => {
            log::warn!("获取资源目录失败: {e}");
            return;
        }
    };
    let wealth_dir = resource_dir.join("resources").join("wealth-level");

    let mut loaded = 0;
    for level in 1..=80u8 {
        let path = wealth_dir.join(format!("{level}.webp"));
        let Ok(bytes) = std::fs::read(&path) else { continue };
        let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let data_url = format!("data:image/webp;base64,{encoded}");
        save_to_cache(state, &format!("wealth-level://{level}"), &data_url);
        loaded += 1;
    }
    if loaded == 0 {
        log::warn!("荣耀等级图标预加载失败：未找到任何资源文件");
    } else {
        log::info!("已预加载 {loaded} 个荣耀等级图标");
    }
}
