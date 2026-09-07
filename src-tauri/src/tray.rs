use crate::{room_store, AppState};
use std::sync::atomic::Ordering;
use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager,
};

/// 执行完整的退出清理流程：停止自动任务、断开连接、销毁窗口、退出进程。
/// 托盘"退出"菜单项与前端 quit_app 命令共用此函数。
pub fn quit_app(app: &AppHandle) {
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app_clone.state::<AppState>();

        {
            let mut auto_sender = state.auto_sender.lock().await;
            if let Some(shutdown_tx) = auto_sender.shutdown_tx.take() {
                let _ = shutdown_tx.send(());
            }
        }
        {
            let mut auto_like = state.auto_like.lock().await;
            if let Some(shutdown_tx) = auto_like.shutdown_tx.take() {
                let _ = shutdown_tx.send(());
            }
        }
        {
            let mut ws_client = state.ws_client.lock().await;
            if let Some(client) = ws_client.as_mut() {
                client.disconnect().await;
            }
        }
        if state.astrbot_active.load(Ordering::Relaxed) {
            let _ = crate::commands::ai_proxy::disconnect_astrbot(state).await;
        }
        for (_, window) in app_clone.webview_windows() {
            let _ = window.destroy();
        }
        app_clone.exit(0);
    });
}

pub fn create_tray(app: &App) -> tauri::Result<()> {
    let menu = build_tray_menu(app.handle())?;

    let icon = load_tray_icon(app);

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(handle_tray_event)
        .show_menu_on_left_click(false);

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

fn handle_tray_event(tray: &TrayIcon, event: TrayIconEvent) {
    // 一次物理点击在 Windows 上会触发 Down + Up 两个 Click 事件；
    // 只在抬起(Up)时触发一次，否则 toggle 会执行两次 = 闪烁后回到原状。
    // DoubleClick 是独立变体，不匹配本分支，自然被忽略。
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        toggle_current_window(tray.app_handle());
    }
}

/// 当前窗口 = 连接着直播间时的弹幕窗口，否则为主页面。
/// 是否连接看弹幕窗口是否存在（hide 只是显示问题，窗口仍在即仍连着）。
fn current_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.webview_windows()
        .into_iter()
        .find(|(label, _)| label.starts_with("danmaku"))
        .map(|(_, win)| win)
        .or_else(|| app.get_webview_window("main"))
}

/// 托盘左键单击：对当前窗口做显示/隐藏切换（不在弹幕与主页面之间互换）
fn toggle_current_window(app: &AppHandle) {
    if let Some(window) = current_window(app) {
        toggle_window(&window);
    }
}

/// 切换窗口显示/隐藏；重新显示时取消最小化并聚焦
fn toggle_window(window: &tauri::WebviewWindow) {
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        show_window(window);
    }
}

/// 显示窗口：取消最小化、显示并聚焦。
/// 弹幕窗口保持 maximizable=false，确保其窗口样式始终不含 WS_MAXIMIZEBOX，
/// 避免拖到屏幕边缘触发 Windows Snap 吸附/分屏。
fn show_window(window: &tauri::WebviewWindow) {
    if window.label().starts_with("danmaku") {
        let _ = window.set_maximizable(false);
    }
    let _ = window.unminimize();
    let _ = window.show();
    // 若窗口处于侧边吸附态，show 后恢复收缩几何以保持吸附
    crate::window_dock::restore_if_docked(window, window.app_handle());
    let _ = window.set_focus();
}

fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id.as_ref();

    match id {
        "quit" => {
            quit_app(app);
        }
        _ if id.starts_with("room:") => {
            let room_id_str = &id["room:".len()..];
            if let Ok(room_id) = room_id_str.parse::<u64>() {
                // switch_room 负责保存选择、刷新托盘、关闭旧房间抽屉窗，
                // 并保持弹幕窗口可见性不变（隐藏不弹出、可见不抢焦点）
                let app_clone = app.clone();
                tauri::async_runtime::spawn(async move {
                    let state = app_clone.state::<AppState>();
                    let _ = crate::commands::room::switch_room(
                        app_clone.clone(),
                        room_id,
                        state,
                    )
                    .await;
                });
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

    // 直播间子菜单：仅显示开播中的房间（状态来自 60s 轮询缓存；
    // 缓存尚未建立时退回显示全部，避免启动期空列表）。
    // 注意状态映射按 UID 键控（get_status_info_by_uids），不是房间号。
    let rooms = room_store::load_rooms(state.inner()).unwrap_or_default();
    let live_status = state.live_status.lock().unwrap().clone();
    let visible_rooms: Vec<_> = match &live_status {
        Some(map) => rooms
            .iter()
            .filter(|room| {
                room.uid
                    .map(|uid| map.get(&uid).copied().unwrap_or(false))
                    .unwrap_or(false)
            })
            .collect(),
        None => rooms.iter().collect(),
    };
    let current_room_id = crate::selections_store::load_values(
        state.inner(),
        &["currentRoomId".to_string()],
    )
    .ok()
    .and_then(|mut m| m.remove("currentRoomId"))
    .and_then(|v| v.as_u64());

    if visible_rooms.is_empty() {
        let label = if live_status.is_some() {
            "直播间：暂无开播"
        } else {
            "直播间：暂无"
        };
        let empty = MenuItem::with_id(app, "rooms-empty", label, false, None::<&str>)?;
        menu.append(&empty)?;
    } else {
        let room_submenu = Submenu::with_id(app, "rooms", "直播间", true)?;
        for room in visible_rooms.into_iter().take(10) {
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

    menu.append(&PredefinedMenuItem::separator(app)?)?;

    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    menu.append(&quit)?;

    Ok(menu)
}

/// 前端可调用的退出命令，执行完整清理后退出进程。
#[tauri::command]
pub fn quit_app_cmd(app: AppHandle) {
    quit_app(&app);
}
