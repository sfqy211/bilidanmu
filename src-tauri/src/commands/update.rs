use serde::{Deserialize, Serialize};
use tauri::State;
use serde_json::Value;

const GITHUB_REPO: &str = "sfqy211/bilidanmu";
const JSDELIVR_URL: &str = "https://cdn.jsdelivr.net/gh/sfqy211/bilidanmu@main/package.json";
const GITHUB_API_URL: &str = "https://api.github.com/repos/sfqy211/bilidanmu/releases/latest";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub latest_version: String,
    pub current_version: String,
    pub has_update: bool,
    pub changelog: String,
    pub release_url: String,
    pub published_at: String,
    pub assets: Vec<ReleaseAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseAsset {
    pub name: String,
    pub download_url: String,
    pub size: u64,
}

/// 检查更新：优先 jsDelivr（大陆可访问），失败时 fallback 到 GitHub API
#[tauri::command]
pub async fn check_update(app: tauri::AppHandle, state: State<'_, crate::AppState>) -> Result<UpdateInfo, String> {
    let current_version = app.package_info().version.to_string();

    // 第一步：通过 jsDelivr 快速获取最新版本号
    let latest_version = match fetch_version_via_jsdelivr(&state).await {
        Ok(v) => v,
        Err(_) => fetch_version_via_github_api(&state).await?,
    };

    let has_update = version_compare(&latest_version, &current_version);

    // 无更新时返回精简信息
    if !has_update {
        return Ok(UpdateInfo {
            latest_version,
            current_version,
            has_update: false,
            changelog: String::new(),
            release_url: String::new(),
            published_at: String::new(),
            assets: Vec::new(),
        });
    }

    // 有更新时获取完整 Release 信息
    fetch_release_info(&state, latest_version, current_version).await
}

/// 通过 jsDelivr CDN 获取版本号（快速，大陆可访问）
async fn fetch_version_via_jsdelivr(state: &crate::AppState) -> Result<String, String> {
    let response = state
        .proxy_client
        .get(JSDELIVR_URL)
        .timeout(std::time::Duration::from_secs(8))
        .send()
        .await
        .map_err(|e| format!("jsDelivr 请求失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("jsDelivr 返回 {}", response.status()));
    }

    let json: Value = response
        .json()
        .await
        .map_err(|e| format!("jsDelivr 解析失败: {e}"))?;

    json.get("version")
        .and_then(Value::as_str)
        .map(|s| s.to_string())
        .ok_or_else(|| "jsDelivr 响应缺少 version 字段".to_string())
}

/// 通过 GitHub API 获取版本号（fallback）
async fn fetch_version_via_github_api(state: &crate::AppState) -> Result<String, String> {
    let response = state
        .proxy_client
        .get(GITHUB_API_URL)
        .header("User-Agent", "BiliDanmu-UpdateChecker")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("检查更新失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("GitHub API 返回 {}", response.status()));
    }

    let json: Value = response
        .json()
        .await
        .map_err(|e| format!("解析更新信息失败: {e}"))?;

    let version = json
        .get("tag_name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim_start_matches("app-v")
        .trim_start_matches('v')
        .to_string();

    if version.is_empty() {
        return Err("GitHub API 响应缺少 tag_name".to_string());
    }

    Ok(version)
}

/// 获取完整 Release 信息（changelog + 下载链接）
async fn fetch_release_info(
    state: &crate::AppState,
    latest_version: String,
    current_version: String,
) -> Result<UpdateInfo, String> {
    let response = state
        .proxy_client
        .get(GITHUB_API_URL)
        .header("User-Agent", "BiliDanmu-UpdateChecker")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("获取 Release 信息失败: {e}"))?;

    if !response.status().is_success() {
        // GitHub API 不可用时返回基础信息
        return Ok(UpdateInfo {
            latest_version,
            current_version,
            has_update: true,
            changelog: "无法获取更新日志".to_string(),
            release_url: format!("https://github.com/{}/releases", GITHUB_REPO),
            published_at: String::new(),
            assets: Vec::new(),
        });
    }

    let json: Value = response
        .json()
        .await
        .map_err(|e| format!("解析 Release 信息失败: {e}"))?;

    let changelog = json
        .get("body")
        .and_then(Value::as_str)
        .unwrap_or("无更新日志")
        .to_string();

    let release_url = json
        .get("html_url")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let published_at = json
        .get("published_at")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let assets: Vec<ReleaseAsset> = json
        .get("assets")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|asset: &Value| {
                    Some(ReleaseAsset {
                        name: asset.get("name")?.as_str()?.to_string(),
                        download_url: asset.get("browser_download_url")?.as_str()?.to_string(),
                        size: asset.get("size")?.as_u64().unwrap_or(0),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(UpdateInfo {
        latest_version,
        current_version,
        has_update: true,
        changelog,
        release_url,
        published_at,
        assets,
    })
}

/// 语义化版本比较，返回 latest > current
fn version_compare(latest: &str, current: &str) -> bool {
    let parse = |s: &str| -> (u32, u32, u32) {
        let parts: Vec<&str> = s.split('.').collect();
        let major = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
        let minor = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
        let patch = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
        (major, minor, patch)
    };
    parse(latest) > parse(current)
}
