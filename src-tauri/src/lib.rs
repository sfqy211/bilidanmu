mod ai_store;
mod bili;
mod commands;
mod credential_store;
mod db;
mod emoticon_store;
mod models;
mod room_store;
mod selections_store;
mod settings_store;
mod tray;

use bili::credential::BiliCredential;
use bili::wbi::WbiKeyCache;
use bili::ws_client::DanmakuWsClient;
use bili::buvid::ensure_buvid;
use std::sync::{Arc, Mutex as StdMutex};
use tauri::Manager;
use tauri::WindowEvent;
use tokio::sync::{oneshot, Mutex};

pub struct LoopSenderState {
    pub shutdown_tx: Option<oneshot::Sender<()>>,
}

pub struct AppState {
    pub credential: Mutex<Option<BiliCredential>>,
    pub wbi_cache: Arc<Mutex<WbiKeyCache>>,
    pub ws_client: Mutex<Option<DanmakuWsClient>>,
    pub loop_sender: Mutex<LoopSenderState>,
    pub db: Arc<StdMutex<Option<rusqlite::Connection>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .manage(AppState {
            credential: Mutex::new(None),
            wbi_cache: Arc::new(Mutex::new(WbiKeyCache::default())),
            ws_client: Mutex::new(None),
            loop_sender: Mutex::new(LoopSenderState { shutdown_tx: None }),
            db: Arc::new(StdMutex::new(None)),
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

            // 尝试从本地存储恢复登录凭据
            if let Ok(Some(cookie)) = credential_store::load_cookie(app.handle()) {
                let mut parsed = BiliCredential::from_cookie_str(&cookie);
                ensure_buvid(&mut parsed);
                if parsed.validate_for_send().is_ok() {
                    let state = app.state::<AppState>();
                    let state = state.inner();
                    // 在启动阶段使用 blocking lock 是安全的，因为此时还没有并发任务
                    if let Ok(mut credential) = state.credential.try_lock() {
                        *credential = Some(parsed);
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
            commands::auth::check_login_status,
            commands::auth::restore_login,
            commands::auth::logout,
            commands::room::search_room,
            commands::room::add_room,
            commands::room::remove_room,
            commands::room::get_room_info,
            commands::room::get_danmu_info,
            commands::room::get_rooms,
            commands::room::get_emoticons,
            commands::room::open_danmaku_window,
            commands::danmaku::send_danmaku,
            commands::danmaku::send_emoticon,
            commands::danmaku::start_loop_send,
            commands::danmaku::stop_loop_send,
            commands::ai::add_ai_model,
            commands::ai::get_ai_models,
            commands::ai::test_ai_connection,
            commands::ai::fetch_models,
            commands::ai::set_current_model,
            commands::ai::update_ai_model,
            commands::ai::delete_ai_model,
            commands::websocket::connect_danmaku_stream,
            commands::websocket::disconnect_danmaku_stream,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::selections::load_selections,
            commands::selections::save_selections
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
