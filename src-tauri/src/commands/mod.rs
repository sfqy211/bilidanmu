use crate::bili::api::BiliApiClient;
use crate::bili::credential::BiliCredential;
use crate::AppState;
use tauri::State;

pub mod ai;
pub mod auth;
pub mod danmaku;
pub mod proxy;
pub mod room;
pub mod selections;
pub mod settings;
pub mod websocket;

pub fn build_api_client(
    credential: Option<BiliCredential>,
    state: &State<'_, AppState>,
) -> Result<BiliApiClient, String> {
    BiliApiClient::new(credential, state.wbi_cache.clone()).map_err(|error| error.to_string())
}
