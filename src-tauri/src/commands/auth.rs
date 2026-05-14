use crate::models::account::{Credential, LoginStatus};
use crate::bili::buvid::ensure_buvid;
use crate::bili::credential::BiliCredential;
use crate::commands::build_api_client;
use crate::{credential_store, AppState};
use tauri::State;

#[tauri::command]
pub async fn login_by_qr() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "url": "https://passport.bilibili.com/login",
        "qrcodeKey": "mock-qrcode-key"
    }))
}

#[tauri::command]
pub async fn poll_qr(_qrcode_key: String) -> Result<Credential, String> {
    Ok(Credential::mock())
}

#[tauri::command]
pub async fn login_by_cookie(
    app: tauri::AppHandle,
    cookie: String,
    state: State<'_, AppState>,
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
    credential_store::clear_cookie(&app)
}
