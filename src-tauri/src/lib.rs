mod bili;
mod commands;
mod models;
mod tray;

use bili::credential::BiliCredential;
use bili::wbi::WbiKeyCache;
use std::sync::Arc;
use tauri::WindowEvent;
use tokio::sync::Mutex;

pub struct AppState {
    pub credential: Mutex<Option<BiliCredential>>,
    pub wbi_cache: Arc<Mutex<WbiKeyCache>>,
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
        })
        .setup(|app| {
            tray::create_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::login_by_qr,
            commands::auth::poll_qr,
            commands::auth::login_by_cookie,
            commands::auth::check_login_status,
            commands::room::search_room,
            commands::room::add_room,
            commands::room::remove_room,
            commands::room::get_room_info,
            commands::room::get_rooms,
            commands::danmaku::send_danmaku,
            commands::danmaku::send_emoticon,
            commands::danmaku::start_loop_send,
            commands::danmaku::stop_loop_send,
            commands::ai::add_ai_model,
            commands::ai::test_ai_connection,
            commands::ai::fetch_models,
            commands::ai::set_current_model,
            commands::websocket::connect_danmaku_stream,
            commands::websocket::disconnect_danmaku_stream,
            commands::settings::get_settings,
            commands::settings::update_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
