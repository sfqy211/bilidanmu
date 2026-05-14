use crate::models::account::{Credential, LoginStatus};
use crate::bili::credential::BiliCredential;

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
pub async fn login_by_cookie(cookie: String) -> Result<Credential, String> {
    let parsed = BiliCredential::from_cookie_str(&cookie);
    parsed.validate_for_send()?;

    let mut credential = Credential::mock();
    credential.uid = parsed
        .dede_user_id
        .as_deref()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(credential.uid);
    credential.cookie = parsed.cookie_header();
    credential.bili_jct = parsed.bili_jct;
    Ok(credential)
}

#[tauri::command]
pub async fn check_login_status() -> Result<LoginStatus, String> {
    Ok(LoginStatus {
        is_logged_in: false,
        account: None,
    })
}
