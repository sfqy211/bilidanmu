use crate::{ai_store, room_store, AppState};
use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{TrayIcon, TrayIconBuilder},
    App, AppHandle, Emitter, Manager,
};

pub fn create_tray(app: &App) -> tauri::Result<()> {
    let menu = build_tray_menu(app.handle())?;

    let icon = load_tray_icon(app);

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .on_menu_event(handle_menu_event)
        .show_menu_on_left_click(true);

    if let Some(icon) = icon {
        builder = builder.icon(icon);
    }

    let tray = builder.build(app)?;
    app.manage(tray);
    Ok(())
}

pub fn refresh_tray(app: &AppHandle) -> Result<(), String> {
    let tray = app
        .try_state::<TrayIcon>()
        .ok_or_else(|| "托盘未初始化".to_string())?;

    let menu = build_tray_menu(app).map_err(|error| error.to_string())?;
    tray.set_menu(Some(menu))
        .map_err(|error| format!("刷新托盘菜单失败: {error}"))
}

fn load_tray_icon(app: &App) -> Option<Image<'_>> {
    app.default_window_icon().cloned()
}

fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id.as_ref();

    match id {
        "show" => show_main_window(app),
        "quit" => app.exit(0),
        _ if id.starts_with("room:") => {
            let room_id_str = &id["room:".len()..];
            if let Ok(room_id) = room_id_str.parse::<u64>() {
                // 保存为当前房间
                let state = app.state::<AppState>();
                let mut entries = serde_json::Map::new();
                entries.insert("currentRoomId".to_string(), serde_json::json!(room_id));
                let _ = crate::selections_store::save_values(state.inner(), &entries);
                let _ = refresh_tray(app);
                let _ = app.emit("room-switched", room_id);

                let label = format!("danmaku-{room_id}");
                if let Some(win) = app.get_webview_window(&label) {
                    let _ = win.show();
                    let _ = win.set_focus();
                } else {
                    let _ = crate::commands::room::open_danmaku_window(app.clone(), room_id);
                }
            }
        }
        _ if id.starts_with("acct:") => {
            let account_id = &id["acct:".len()..];
            let account_id = account_id.to_string();
            let app_clone = app.clone();
            tauri::async_runtime::spawn(async move {
                let state = app_clone.state::<AppState>();
                let uid = account_id.clone();
                match crate::commands::auth::switch_account(
                    app_clone.clone(),
                    account_id,
                    state,
                ).await {
                    Ok(credential) => {
                        let _ = app_clone.emit("account-switched", serde_json::json!({
                            "accountId": uid,
                            "credential": credential,
                        }));
                    }
                    Err(e) => {
                        let _ = app_clone.emit("account-switch-error", e);
                    }
                }
            });
        }
        _ if id.starts_with("ai:") => {
            let model_id = &id["ai:".len()..];
            let state = app.state::<AppState>();
            if let Ok(mut models) = ai_store::load_models(state.inner()) {
                for model in &mut models {
                    model.is_current = Some(model.id == model_id);
                }
                let _ = ai_store::save_models(state.inner(), &models);
                let _ = refresh_tray(app);
            }
        }
        _ => {}
    }
}

fn build_tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;

    let title = MenuItem::with_id(app, "title", "BiliDanmu", false, None::<&str>)?;
    menu.append(&title)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // 账号子菜单（显示所有已登录账号）
    let state = app.state::<AppState>();

    // 从 AppState 读取（已由 setup 或 restore_login 填充）
    let credentials = state.credentials.lock().unwrap();
    let active_id = state.active_account_id.lock().unwrap();
    let metas = state.account_metas.lock().unwrap();

    if credentials.is_empty() {
        let empty = MenuItem::with_id(app, "account-empty", "账号：未登录", false, None::<&str>)?;
        menu.append(&empty)?;
    } else {
        let account_submenu = Submenu::with_id(app, "accounts", "账号", true)?;

        for (uid, _cred) in credentials.iter() {
            let is_active = active_id.as_deref() == Some(uid.as_str());

            // 优先使用保存的用户名，否则 fallback 到 UID
            let display_name = metas
                .get(uid)
                .map(|m| m.username.as_str())
                .unwrap_or(uid);

            let label = display_name.to_string();

            let item = CheckMenuItem::with_id(
                app,
                format!("acct:{uid}"),
                &label,
                true,
                is_active,
                None::<&str>,
            )?;
            account_submenu.append(&item)?;
        }

        menu.append(&account_submenu)?;
    }
    drop(credentials);
    drop(active_id);
    drop(metas);

    // 直播间子菜单
    let rooms = room_store::load_rooms(state.inner()).unwrap_or_default();
    let current_room_id = crate::selections_store::load_values(
        state.inner(),
        &["currentRoomId".to_string()],
    )
    .ok()
    .and_then(|mut m| m.remove("currentRoomId"))
    .and_then(|v| v.as_u64());

    if rooms.is_empty() {
        let empty = MenuItem::with_id(app, "rooms-empty", "直播间：暂无", false, None::<&str>)?;
        menu.append(&empty)?;
    } else {
        let room_submenu = Submenu::with_id(app, "rooms", "直播间", true)?;
        for room in rooms.iter().take(10) {
            let is_current = current_room_id == Some(room.room_id);
            let item = CheckMenuItem::with_id(
                app,
                format!("room:{}", room.room_id),
                &room.uname,
                true,
                is_current,
                None::<&str>,
            )?;
            room_submenu.append(&item)?;
        }
        menu.append(&room_submenu)?;
    }

    // AI 模型子菜单
    let models = ai_store::load_models(state.inner()).unwrap_or_default();
    let current_id = models
        .iter()
        .find(|item| item.is_current == Some(true))
        .map(|item| item.id.as_str());

    if models.is_empty() {
        let empty = MenuItem::with_id(app, "ai-empty", "AI：未配置", false, None::<&str>)?;
        menu.append(&empty)?;
    } else {
        let ai_submenu = Submenu::with_id(app, "ai-models", "AI 模型", true)?;
        for model in &models {
            let is_current = Some(model.id.as_str()) == current_id;
            let item = CheckMenuItem::with_id(
                app,
                format!("ai:{}", model.id),
                &model.model_name,
                true,
                is_current,
                None::<&str>,
            )?;
            ai_submenu.append(&item)?;
        }
        menu.append(&ai_submenu)?;
    }

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
