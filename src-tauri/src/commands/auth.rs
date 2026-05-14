use crate::bili::api::BiliApiClient;
use crate::models::account::{Credential, LoginStatus};
use crate::bili::credential::BiliCredential;
use crate::AppState;
use tauri::State;

fn build_api_client(
    credential: Option<BiliCredential>,
    state: &State<'_, AppState>,
) -> Result<BiliApiClient, String> {
    BiliApiClient::new(credential, state.wbi_cache.clone()).map_err(|error| error.to_string())
}

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
pub async fn login_by_cookie(cookie: String, state: State<'_, AppState>) -> Result<Credential, String> {
    let parsed = BiliCredential::from_cookie_str(&cookie);
    parsed.validate_for_send()?;

    {
        let mut credential_state = state.credential.lock().await;
        *credential_state = Some(parsed.clone());
    }

    let api = build_api_client(Some(parsed.clone()), &state)?;
    let login_status = api.verify_login_status().await?;

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
