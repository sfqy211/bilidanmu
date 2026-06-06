use crate::bili::api::BiliApiClient;
use crate::bili::credential::BiliCredential;
use crate::AppState;
use tauri::State;

pub mod ai_proxy;
pub mod auth;
pub mod danmaku;
pub mod proxy;
pub mod room;
pub mod selections;
pub mod settings;
pub mod stt;
pub mod websocket;

pub fn build_api_client(
    credential: Option<BiliCredential>,
    state: &State<'_, AppState>,
) -> BiliApiClient {
    BiliApiClient::new(
        state.proxy_client.clone(),
        credential,
        state.wbi_cache.clone(),
    )
}

/// 获取发送凭证：优先 sending_credential，fallback 到主 credential
pub async fn get_sending_credential(state: &AppState) -> Option<BiliCredential> {
    let sending = state.sending_credential.lock().await;
    if sending.is_some() {
        return sending.clone();
    }
    state.credential.lock().await.clone()
}
