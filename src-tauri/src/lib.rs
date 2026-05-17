mod ai_store;
mod bili;
mod commands;
mod credential_store;
mod db;
mod emoticon_store;
mod models;
mod proxy;
mod room_store;
mod selections_store;
mod settings_store;
mod stt;
mod tray;

use bili::credential::BiliCredential;
use bili::wbi::WbiKeyCache;
use bili::ws_client::DanmakuWsClient;
use bili::buvid::ensure_buvid;
use proxy::stream_proxy::StreamProxyServer;
use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};
use tauri::Manager;
use tauri::WindowEvent;
use tokio::sync::{oneshot, Mutex as TokioMutex};

const PROXY_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

pub struct AutoSenderState {
    pub shutdown_tx: Option<oneshot::Sender<()>>,
}

pub struct AppState {
    pub credential: TokioMutex<Option<BiliCredential>>,
    pub credentials: std::sync::Mutex<HashMap<String, BiliCredential>>,
    pub active_account_id: std::sync::Mutex<Option<String>>,
    pub account_metas: std::sync::Mutex<HashMap<String, credential_store::AccountMeta>>,
    pub wbi_cache: Arc<TokioMutex<WbiKeyCache>>,
    pub ws_client: TokioMutex<Option<DanmakuWsClient>>,
    pub auto_sender: TokioMutex<AutoSenderState>,
    pub db: Arc<StdMutex<Option<rusqlite::Connection>>>,
    pub proxy_client: reqwest::Client,
    pub stream_proxy: Arc<StreamProxyServer>,
    pub stt_manager: Arc<TokioMutex<Option<stt::SttManager>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let proxy_client = reqwest::Client::builder()
        .user_agent(PROXY_USER_AGENT)
        .build()
        .expect("failed to build proxy HTTP client");

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                ])
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(AppState {
            credential: TokioMutex::new(None),
            credentials: std::sync::Mutex::new(HashMap::new()),
            active_account_id: std::sync::Mutex::new(None),
            account_metas: std::sync::Mutex::new(HashMap::new()),
            wbi_cache: Arc::new(TokioMutex::new(WbiKeyCache::default())),
            ws_client: TokioMutex::new(None),
            auto_sender: TokioMutex::new(AutoSenderState { shutdown_tx: None }),
            db: Arc::new(StdMutex::new(None)),
            proxy_client: proxy_client.clone(),
            stream_proxy: Arc::new(StreamProxyServer::new(proxy_client)),
            stt_manager: Arc::new(TokioMutex::new(None)),
        })
        .setup(|app| {
            tray::create_tray(app)?;

            if let Ok(connection) = db::open_database(app.handle()) {
                let state = app.state::<AppState>();
                let state = state.inner();
                if let Ok(mut db) = state.db.lock() {
                    *db = Some(connection);
                }
            }

            // 尝试从本地存储恢复所有登录凭据
            if let Ok(cookies) = credential_store::load_all_cookies(app.handle()) {
                if !cookies.is_empty() {
                    let state = app.state::<AppState>();
                    let state = state.inner();

                    // 加载活跃账号 ID
                    let active_id = credential_store::load_active_account_id(app.handle()).ok().flatten();

                    // 解析所有账号
                    let mut credentials_map: HashMap<String, BiliCredential> = HashMap::new();
                    for (uid, cookie) in &cookies {
                        let mut parsed = BiliCredential::from_cookie_str(cookie);
                        ensure_buvid(&mut parsed);
                        if parsed.validate_for_send().is_ok() {
                            credentials_map.insert(uid.clone(), parsed);
                        }
                    }

                    *state.credentials.lock().unwrap() = credentials_map.clone();

                    // 加载账号元数据
                    if let Ok(metas) = credential_store::load_account_metas(app.handle()) {
                        *state.account_metas.lock().unwrap() = metas;
                    }

                    // 激活上次使用的账号
                    let active_uid = active_id
                        .filter(|id| credentials_map.contains_key(id));
                    if let Some(uid) = active_uid {
                        if let Some(cred) = credentials_map.get(&uid) {
                            // 在启动阶段使用 try_lock（此时 tokio runtime 尚未完全就绪）
                            // 如果 try_lock 失败，restore_login 命令会从磁盘重新加载
                            if let Ok(mut credential) = state.credential.try_lock() {
                                *credential = Some(cred.clone());
                            }
                            *state.active_account_id.lock().unwrap() = Some(uid.clone());
                        }
                    }
                }
            }

            let _ = tray::refresh_tray(app.handle());

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::login_by_qr,
            commands::auth::poll_qr,
            commands::auth::login_by_cookie,
            commands::auth::restore_login,
            commands::auth::logout,
            commands::auth::remove_account,
            commands::auth::switch_account,
            commands::auth::list_accounts,
            commands::room::search_room,
            commands::room::add_room,
            commands::room::remove_room,
            commands::room::get_room_info,
            commands::room::get_rooms,
            commands::room::get_emoticons,
            commands::room::open_danmaku_window,
            commands::room::get_audio_stream_url,
            commands::room::clear_audio_stream,
            commands::room::get_rooms_live_status,
            commands::danmaku::send_danmaku,
            commands::danmaku::send_emoticon,
            commands::danmaku::start_auto_send,
            commands::danmaku::stop_auto_send,
            commands::ai::add_ai_model,
            commands::ai::get_ai_models,
            commands::ai::test_ai_connection,
            commands::ai::fetch_models,
            commands::ai::set_current_model,
            commands::ai::update_ai_model,
            commands::ai::delete_ai_model,
            commands::websocket::connect_danmaku_stream,
            commands::websocket::disconnect_danmaku_stream,
            commands::proxy::proxy_image,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::selections::load_selections,
            commands::selections::save_selections,
            commands::stt::start_stt,
            commands::stt::stop_stt,
            commands::stt::switch_stt_model
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
