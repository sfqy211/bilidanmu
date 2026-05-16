use crate::AppState;
use tauri::State;

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

#[tauri::command]
pub async fn proxy_image(url: String, state: State<'_, AppState>) -> Result<String, String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err(format!("无效的图片 URL: {url}"));
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
    Ok(format!("data:{content_type};base64,{encoded}"))
}
