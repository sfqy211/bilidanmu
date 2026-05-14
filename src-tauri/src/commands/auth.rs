use crate::models::account::{Credential, LoginStatus};

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
    let mut credential = Credential::mock();
    credential.cookie = cookie;
    Ok(credential)
}

#[tauri::command]
pub async fn check_login_status() -> Result<LoginStatus, String> {
    Ok(LoginStatus {
        is_logged_in: false,
        account: None,
    })
}
