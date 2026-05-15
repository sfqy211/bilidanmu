use crate::{ai_store, credential_store, room_store};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    App, AppHandle, Manager,
};

pub fn create_tray(app: &App) -> tauri::Result<()> {
    let tray = TrayIconBuilder::with_id("main")
        .menu(&build_tray_menu(app.handle())?)
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            match id {
                "show" => show_main_window(app),
                "quit" => app.exit(0),
                _ if id.starts_with("room:") => show_main_window(app),
                _ if id.starts_with("ai:") => show_main_window(app),
                _ => {}
            }
        })
        .build(app)?;

    app.manage(tray);
    Ok(())
}

pub fn refresh_tray(app: &AppHandle) -> Result<(), String> {
    let tray = app
        .try_state::<TrayIcon>()
        .ok_or_else(|| "托盘未初始化".to_string())?;

    tray.set_menu(Some(build_tray_menu(app).map_err(|error| error.to_string())?))
        .map_err(|error| format!("刷新托盘菜单失败: {error}"))
}

fn build_tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;

    let title = MenuItem::with_id(app, "title", "BiliDanmu", false, None::<&str>)?;
    menu.append(&title)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    let account_text = match credential_store::load_cookie(app) {
        Ok(Some(_)) => "👤 账号：已登录",
        _ => "👤 账号：未登录",
    };
    let account = MenuItem::with_id(app, "account", account_text, false, None::<&str>)?;
    menu.append(&account)?;

    let rooms = room_store::load_rooms(app).unwrap_or_default();
    if rooms.is_empty() {
        let empty = MenuItem::with_id(app, "rooms-empty", "📺 直播间：暂无", false, None::<&str>)?;
        menu.append(&empty)?;
    } else {
        let room_header = MenuItem::with_id(app, "rooms", "📺 直播间", false, None::<&str>)?;
        menu.append(&room_header)?;
        for room in rooms.iter().take(5) {
            let label = format!("  • {} ({})", room.uname, room.room_id);
            let item = MenuItem::with_id(app, format!("room:{}", room.room_id), label, true, None::<&str>)?;
            menu.append(&item)?;
        }
    }

    let models = ai_store::load_models(app).unwrap_or_default();
    let current_model = models.iter().find(|item| item.is_current == Some(true));
    let ai_text = current_model
        .map(|item| format!("🤖 AI：{}", item.model_name))
        .unwrap_or_else(|| "🤖 AI：未设置".to_string());
    let ai = MenuItem::with_id(app, "ai-current", ai_text, false, None::<&str>)?;
    menu.append(&ai)?;

    menu.append(&PredefinedMenuItem::separator(app)?)?;

    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    menu.append(&show)?;
    menu.append(&quit)?;

    Ok(menu)
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
