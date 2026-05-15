use crate::models::account::{Credential, LoginStatus};
use crate::bili::buvid::ensure_buvid;
use crate::bili::credential::BiliCredential;
use crate::commands::build_api_client;
use crate::tray;
use crate::{credential_store, AppState};
use tauri::State;

#[tauri::command]
pub async fn login_by_qr() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .build()
        .map_err(|error| format!("创建 HTTP 客户端失败: {error}"))?;

    let response = client
        .get("https://passport.bilibili.com/x/passport-login/web/qrcode/generate")
        .header("Referer", "https://www.bilibili.com/")
        .send()
        .await
        .map_err(|error| format!("获取二维码失败: {error}"))?;

    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|error| format!("解析二维码响应失败: {error}"))?;

    let code = json.get("code").and_then(serde_json::Value::as_i64).unwrap_or(-1);
    if code != 0 {
        return Err(json
            .get("message")
            .or_else(|| json.get("msg"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("获取二维码失败")
            .to_string());
    }

    let data = json.get("data").ok_or_else(|| "二维码响应缺少 data 字段".to_string())?;
    Ok(serde_json::json!({
        "url": data.get("url").and_then(serde_json::Value::as_str).unwrap_or_default(),
        "qrcodeKey": data.get("qrcode_key").and_then(serde_json::Value::as_str).unwrap_or_default()
    }))
}

#[tauri::command]
pub async fn poll_qr(
    app: tauri::AppHandle,
    qrcode_key: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .build()
        .map_err(|error| format!("创建 HTTP 客户端失败: {error}"))?;

    let response = client
        .get("https://passport.bilibili.com/x/passport-login/web/qrcode/poll")
        .header("Referer", "https://www.bilibili.com/")
        .query(&[("qrcode_key", qrcode_key)])
        .send()
        .await
        .map_err(|error| format!("轮询二维码状态失败: {error}"))?;

    let headers = response.headers().clone();
    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|error| format!("解析二维码轮询响应失败: {error}"))?;

    let outer_code = json.get("code").and_then(serde_json::Value::as_i64).unwrap_or(-1);
    if outer_code != 0 {
        return Err(json
            .get("message")
            .or_else(|| json.get("msg"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("二维码轮询失败")
            .to_string());
    }

    let data = json.get("data").ok_or_else(|| "二维码轮询响应缺少 data 字段".to_string())?;
    let status_code = data.get("code").and_then(serde_json::Value::as_i64).unwrap_or(-1);

    match status_code {
        0 => {
            let cookie = headers
                .get_all(reqwest::header::SET_COOKIE)
                .iter()
                .filter_map(|value| value.to_str().ok())
                .filter_map(|value| value.split(';').next())
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join("; ");

            let credential = complete_login_with_cookie(&app, &state, cookie).await?;
            Ok(serde_json::json!({
                "status": "success",
                "message": "扫码登录成功",
                "credential": credential,
            }))
        }
        86038 => Ok(serde_json::json!({
            "status": "expired",
            "message": data.get("message").and_then(serde_json::Value::as_str).unwrap_or("二维码已过期"),
        })),
        86090 => Ok(serde_json::json!({
            "status": "scanned",
            "message": data.get("message").and_then(serde_json::Value::as_str).unwrap_or("已扫码，等待确认"),
        })),
        _ => Ok(serde_json::json!({
            "status": "pending",
            "message": data.get("message").and_then(serde_json::Value::as_str).unwrap_or("等待扫码"),
        })),
    }
}

#[tauri::command]
pub async fn login_by_cookie(
    app: tauri::AppHandle,
    cookie: String,
    state: State<'_, AppState>,
) -> Result<Credential, String> {
    complete_login_with_cookie(&app, &state, cookie).await
}

async fn complete_login_with_cookie(
    app: &tauri::AppHandle,
    state: &State<'_, AppState>,
    cookie: String,
) -> Result<Credential, String> {
    let mut parsed = BiliCredential::from_cookie_str(&cookie);
    ensure_buvid(&mut parsed);
    parsed.validate_for_send()?;

    {
        let mut credential_state = state.credential.lock().await;
        *credential_state = Some(parsed.clone());
    }

    let api = build_api_client(Some(parsed.clone()), &state)?;
    let login_status = api.verify_login_status().await?;

    // 登录验证成功后保存 cookie 到本地存储
    credential_store::save_cookie(&app, &cookie)?;
    let _ = tray::refresh_tray(&app);

    let mut credential = Credential::mock();
    if let Some(account) = login_status.account {
        credential.account_id = account.id;
        credential.uid = account.uid;
        credential.username = account.username;
        credential.avatar = account.avatar;
    } else {
        credential.uid = parsed
            .dede_user_id
            .as_deref()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(credential.uid);
    }
    credential.cookie = parsed.cookie_header();
    credential.bili_jct = parsed.bili_jct.clone();
    Ok(credential)
}

#[tauri::command]
pub async fn check_login_status(state: State<'_, AppState>) -> Result<LoginStatus, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state)?;
    api.verify_login_status().await
}

/// 应用启动时尝试恢复已保存的登录状态
#[tauri::command]
pub async fn restore_login(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<Credential>, String> {
    // 先检查 AppState 中是否已有凭据（setup 阶段加载的）
    let existing = state.credential.lock().await.clone();

    let parsed = match existing {
        Some(cred) => cred,
        None => {
            // AppState 中没有，尝试从本地存储加载
            match credential_store::load_cookie(&app)? {
                Some(cookie) => {
                    let mut cred = BiliCredential::from_cookie_str(&cookie);
                    ensure_buvid(&mut cred);
                    if cred.validate_for_send().is_err() {
                        return Ok(None);
                    }
                    {
                        let mut credential_state = state.credential.lock().await;
                        *credential_state = Some(cred.clone());
                    }
                    cred
                }
                None => return Ok(None),
            }
        }
    };

    // 验证登录状态是否仍然有效
    let api = build_api_client(Some(parsed.clone()), &state)?;
    let login_status = api.verify_login_status().await?;

    if !login_status.is_logged_in {
        // 登录已过期，清除本地存储
        let _ = credential_store::clear_cookie(&app);
        let mut credential_state = state.credential.lock().await;
        *credential_state = None;
        return Ok(None);
    }

    let mut credential = Credential::mock();
    if let Some(account) = login_status.account {
        credential.account_id = account.id;
        credential.uid = account.uid;
        credential.username = account.username;
        credential.avatar = account.avatar;
    } else {
        credential.uid = parsed
            .dede_user_id
            .as_deref()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(credential.uid);
    }
    credential.cookie = parsed.cookie_header();
    credential.bili_jct = parsed.bili_jct.clone();
    Ok(Some(credential))
}

/// 退出登录，清除本地凭据
#[tauri::command]
pub async fn logout(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut credential_state = state.credential.lock().await;
        *credential_state = None;
    }
    credential_store::clear_cookie(&app)?;
    let _ = tray::refresh_tray(&app);
    Ok(())
}
