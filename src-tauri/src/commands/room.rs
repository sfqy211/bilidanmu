use crate::bili::api::BiliApiClient;
use crate::commands::{build_api_client, get_sending_credential};
use crate::models::room::{Emoticon, EmoticonPackage, Room, RoomInfo, SearchRoomResult};
use crate::models::stream::StreamInfo;
use crate::room_store;
use crate::tray;
use crate::AppState;
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

#[tauri::command]
pub async fn search_room(
    query: String,
    mode: String,
    state: State<'_, AppState>,
) -> Result<Vec<SearchRoomResult>, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state);

    match mode.as_str() {
        "roomId" | "link" => {
            let room_id = extract_room_id(&query)?;
            let room = api.get_room_info(room_id).await?;
            Ok(vec![SearchRoomResult::from(room)])
        }
        "uid" => {
            let uid = extract_number(&query, "UID")?;
            Ok(vec![api.resolve_room_by_uid(uid).await?])
        }
        "name" => {
            api.search_rooms_by_name(&query, 1).await
        }
        _ => Err("不支持的搜索模式".to_string()),
    }
}

#[tauri::command]
pub async fn add_room(
    app: tauri::AppHandle,
    room_id: u64,
    state: State<'_, AppState>,
) -> Result<RoomInfo, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state);
    let room = api.get_room_info(room_id).await?;
    room_store::upsert_room(state.inner(), &room.room)?;
    let _ = tray::refresh_tray(&app);
    Ok(room)
}

#[tauri::command]
pub async fn remove_room(app: tauri::AppHandle, room_id: u64, state: State<'_, AppState>) -> Result<(), String> {
    room_store::remove_room(state.inner(), room_id)?;
    crate::emoticon_store::clear_room_emoticons(state.inner(), room_id)?;
    let _ = tray::refresh_tray(&app);
    Ok(())
}

#[tauri::command]
/// 后台刷新所有已存储房间的信息（标题、封面等）
pub async fn refresh_all_rooms(app: tauri::AppHandle) {
    use tauri::Emitter;

    let state = app.state::<AppState>();
    let rooms = room_store::load_rooms(state.inner()).unwrap_or_default();
    if rooms.is_empty() {
        return;
    }

    let credential = state.credential.lock().await.clone();
    let api = BiliApiClient::new(
        state.proxy_client.clone(),
        credential,
        state.wbi_cache.clone(),
    );

    let mut updated = false;
    for room in &rooms {
        if let Ok(info) = api.get_room_info(room.room_id).await {
            if room_store::upsert_room(state.inner(), &info.room).is_ok() {
                updated = true;
            }
        }
    }

    if updated {
        let _ = tray::refresh_tray(&app);
        let _ = app.emit("rooms-updated", ());
    }
}

#[tauri::command]
pub async fn get_room_info(app: tauri::AppHandle, room_id: u64, state: State<'_, AppState>) -> Result<RoomInfo, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state);
    let room_info = api.get_room_info(room_id).await?;
    // 同步更新存储中的房间信息（标题、封面等）
    if room_store::upsert_room(state.inner(), &room_info.room).is_ok() {
        let _ = tray::refresh_tray(&app);
    }
    Ok(room_info)
}

#[tauri::command]
pub async fn get_rooms(state: State<'_, AppState>) -> Result<Vec<Room>, String> {
    room_store::load_rooms(state.inner())
}

#[tauri::command]
pub async fn get_live_time(room_id: u64, state: State<'_, AppState>) -> Result<Option<u64>, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state);
    api.get_live_time(room_id).await
}

#[tauri::command]
pub async fn get_emoticons(
    room_id: u64,
    force: Option<bool>,
    account_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<EmoticonPackage>, String> {
    let force = force.unwrap_or(false);
    // 使用传入的 account_id，或从发送凭据获取，或 fallback 到主凭据
    let account_id = account_id
        .filter(|s| !s.is_empty())
        .or_else(|| {
            let sending = state.sending_credential.try_lock().ok()?;
            sending.as_ref().and_then(|c| c.dede_user_id.clone())
        })
        .or_else(|| {
            let cred = state.credential.try_lock().ok()?;
            cred.as_ref().and_then(|c| c.dede_user_id.clone())
        })
        .unwrap_or_default();

    // 优先使用缓存（除非强制刷新）
    if !force {
        let cached = crate::emoticon_store::load_room_packages(state.inner(), room_id, &account_id);
        if !cached.is_empty() {
            let mut sorted = cached;
            sorted.sort_by_key(|pkg| emoticon_sort_priority(pkg.pkg_type));
            return Ok(sorted);
        }
    }

    // 缓存为空或强制刷新，从 API 拉取
    let credential = get_sending_credential(state.inner()).await;
    let api = build_api_client(credential, &state);
    let fresh_packages = api.get_emoticons(room_id).await?;

    // 清理旧的非房间专属映射（保留 pkg_type 2/3）
    crate::emoticon_store::clear_non_room_specific_mappings(state.inner(), room_id, &account_id);

    // 批量缓存所有包（单次事务）
    crate::emoticon_store::save_packages(state.inner(), &fresh_packages)?;
    let mut result = fresh_packages;

    // 更新房间-包映射
    crate::emoticon_store::save_room_packages(state.inner(), room_id, &account_id, &result)?;

    // 按类型排序：系统表情/emoji → UP主大表情/房间通用 → 装扮表情
    result.sort_by_key(|pkg| emoticon_sort_priority(pkg.pkg_type));
    Ok(result)
}

/// 表情包排序优先级（数字越小越靠前）
fn emoticon_sort_priority(pkg_type: Option<u64>) -> u8 {
    match pkg_type {
        Some(0) | Some(1) => 0,  // 系统表情、emoji
        Some(2) | Some(3) => 1,  // 房间专属、UP主大表情
        _ => 2,                   // 装扮表情及其他
    }
}

/// 清理所有表情缓存
#[tauri::command]
pub async fn clear_emoticon_cache(state: State<'_, AppState>) -> Result<(), String> {
    crate::emoticon_store::clear_all(state.inner())
}

/// 清理指定房间的表情缓存
#[tauri::command]
pub async fn clear_room_emoticon_cache(room_id: u64, state: State<'_, AppState>) -> Result<(), String> {
    crate::emoticon_store::clear_room_emoticons(state.inner(), room_id)
}

/// 清理所有房间专属表情包
#[tauri::command]
pub async fn clear_room_specific_emoticons(state: State<'_, AppState>) -> Result<(), String> {
    crate::emoticon_store::clear_room_specific_emoticons(state.inner())
}

/// 关闭指定房间的所有抽屉窗口
#[allow(dead_code)]
pub(crate) fn close_drawer_windows(app: &tauri::AppHandle, room_id: u64) {
    let prefix = format!("drawer-{room_id}-");
    for (label, window) in app.webview_windows() {
        if label.starts_with(&prefix) {
            let _ = window.destroy();
        }
    }
}

#[tauri::command]
pub async fn open_drawer_window(
    app: tauri::AppHandle,
    room_id: u64,
    panel: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    // 校验面板类型
    let valid_panels = ["ai"];
    if !valid_panels.contains(&panel.as_str()) {
        return Err(format!("无效的面板类型: {panel}"));
    }

    let label = format!("drawer-{room_id}-{panel}");

    // 如果已存在该面板的抽屉，关闭（切换效果）
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.destroy();
        return Ok(());
    }

    // 获取弹幕窗口位置，将抽屉定位在其右侧
    let danmaku_label = format!("danmaku-{room_id}");
    let (pos_x, pos_y, danmaku_h) = if let Some(danmaku_win) = app.get_webview_window(&danmaku_label) {
        let pos = danmaku_win.outer_position().map_err(|e| e.to_string())?;
        let size = danmaku_win.outer_size().map_err(|e| e.to_string())?;
        (pos.x as f64 + size.width as f64, pos.y as f64, size.height as f64)
    } else {
        return Err("弹幕窗口未打开".to_string());
    };

    let path = format!("/drawer/{room_id}/{panel}")
        .parse()
        .map_err(|error| format!("解析抽屉窗口路由失败: {error}"))?;

    let drawer_w = 280.0;
    let drawer_h = danmaku_h;

    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(path))
        .title("功能面板")
        .inner_size(drawer_w, drawer_h)
        .min_inner_size(240.0, 200.0)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .position(pos_x, pos_y)
        .build()
        .map_err(|error| error.to_string())?;

    // 移除 WS_MAXIMIZEBOX 以禁用 Windows Snap Layouts
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongW, SetWindowLongW, GWL_STYLE,
        };
        const WS_MAXIMIZEBOX: i32 = 0x0001_0000;
        if let Ok(hwnd) = window.hwnd() {
            let hwnd = HWND(hwnd.0 as _);
            unsafe {
                let style = GetWindowLongW(hwnd, GWL_STYLE);
                if style != 0 {
                    SetWindowLongW(hwnd, GWL_STYLE, style & !WS_MAXIMIZEBOX);
                }
            }
        }
    }

    // 监听弹幕窗口移动，同步重定位抽屉窗口
    let app_handle = app.clone();
    let drawer_label = label.clone();
    if let Some(danmaku_win) = app.get_webview_window(&danmaku_label) {
        danmaku_win.on_window_event(move |event| {
            if let WindowEvent::Moved(_) = event {
                if let (Some(dm), Some(drawer)) = (
                    app_handle.get_webview_window(&danmaku_label),
                    app_handle.get_webview_window(&drawer_label),
                ) {
                    if let (Ok(pos), Ok(size)) = (dm.outer_position(), dm.outer_size()) {
                        let _ = drawer.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                            x: pos.x + size.width as i32,
                            y: pos.y,
                        }));
                    }
                }
            }
        });
    }

    Ok(())
}

/// 关闭除指定房间外的所有弹幕窗口
pub(crate) fn close_other_danmaku_windows(app: &tauri::AppHandle, keep_room_id: u64) {
    let keep_label = format!("danmaku-{keep_room_id}");
    for (label, window) in app.webview_windows() {
        if label.starts_with("danmaku-") && label != keep_label {
            let _ = window.destroy();
        }
    }
}

#[tauri::command]
pub async fn open_danmaku_window(
    app: tauri::AppHandle,
    room_id: u64,
    width: Option<f64>,
    height: Option<f64>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Hold this guard for the whole open/show sequence so danmaku windows stay mutually exclusive.
    let _danmaku_window_guard = state.danmaku_window_lock.lock().await;

    // 关闭其他房间的弹幕窗口，弹幕窗口互斥
    close_other_danmaku_windows(&app, room_id);

    let label = format!("danmaku-{room_id}");

    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        hide_main_window_if_enabled(&app, state.inner());
        return Ok(());
    }

    let path = format!("/danmaku/{room_id}")
        .parse()
        .map_err(|error| format!("解析弹幕窗口路由失败: {error}"))?;

    let w = width.filter(|v| *v >= 240.0 && *v <= 1200.0).unwrap_or(420.0);
    let h = height.filter(|v| *v >= 160.0 && *v <= 900.0).unwrap_or(320.0);

    let title = room_store::get_room_display_info(state.inner(), room_id)
        .map(|(uname, room_title)| format!("{uname} - {room_title}"))
        .unwrap_or_else(|| format!("房间 {room_id}"));

    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(path))
        .title(title)
        .inner_size(w, h)
        .min_inner_size(240.0, 160.0)
        .max_inner_size(1200.0, 900.0)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .shadow(false)
        .build()
        .map_err(|error| error.to_string())?;

    // 移除 WS_MAXIMIZEBOX 以禁用 Windows Snap Layouts，保留 WS_SIZEBOX 以支持边缘拖拽缩放
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongW, SetWindowLongW, GWL_STYLE,
        };
        const WS_MAXIMIZEBOX: i32 = 0x0001_0000;
        if let Ok(hwnd) = window.hwnd() {
            let hwnd = HWND(hwnd.0 as _);
            unsafe {
                let style = GetWindowLongW(hwnd, GWL_STYLE);
                if style != 0 {
                    SetWindowLongW(hwnd, GWL_STYLE, style & !WS_MAXIMIZEBOX);
                }
            }
        }
    }

    hide_main_window_if_enabled(&app, state.inner());
    Ok(())
}

/// 读取"进入直播间时隐藏主窗口"开关；设置读取失败时回退为不隐藏（非破坏性）
fn auto_hide_main_enabled(state: &AppState) -> bool {
    crate::settings_store::load_settings(state)
        .map(|s| s.window.auto_hide_main)
        .unwrap_or(false)
}

/// 按设置在进入直播间时隐藏主窗口，并记录是本功能所为
fn hide_main_window_if_enabled(app: &tauri::AppHandle, state: &AppState) {
    if !auto_hide_main_enabled(state) {
        return;
    }
    if let Some(main) = app.get_webview_window("main") {
        // 仅当主窗口当前可见时才隐藏并置位，避免覆盖用户手动隐藏的状态
        if main.is_visible().unwrap_or(false) {
            let _ = main.hide();
            state
                .main_window_auto_hidden
                .store(true, std::sync::atomic::Ordering::Relaxed);
        }
    }
}

/// 恢复由 hide_main_window_if_enabled 隐藏的主窗口；用户手动隐藏的不动
fn restore_main_window_if_auto_hidden(app: &tauri::AppHandle, state: &AppState) {
    // 先 swap 清零再查窗口：若 main 已不存在则直接丢弃标志，避免留下永远置位的脏标志
    if state
        .main_window_auto_hidden
        .swap(false, std::sync::atomic::Ordering::Relaxed)
    {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.unminimize();
            let _ = main.show();
            let _ = main.set_focus();
        }
    }
}

#[tauri::command]
pub async fn exit_room(
    app: tauri::AppHandle,
    room_id: u64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // 与 open_danmaku_window 互斥，避免开窗/退窗流程交错
    let _danmaku_window_guard = state.danmaku_window_lock.lock().await;

    // 销毁该房间的弹幕窗口与抽屉窗口
    let danmaku_label = format!("danmaku-{room_id}");
    let drawer_prefix = format!("drawer-{room_id}-");
    for (label, window) in app.webview_windows() {
        if label == danmaku_label || label.starts_with(&drawer_prefix) {
            let _ = window.destroy();
        }
    }

    // 仅恢复由本功能自动隐藏的主窗口（用户手动隐藏的不动）
    restore_main_window_if_auto_hidden(&app, state.inner());
    Ok(())
}

fn extract_number(input: &str, label: &str) -> Result<u64, String> {
    input
        .chars()
        .filter(|char| char.is_ascii_digit())
        .collect::<String>()
        .parse::<u64>()
        .map_err(|_| format!("无法从输入中解析{label}"))
}

fn extract_room_id(input: &str) -> Result<u64, String> {
    extract_number(input, "房间号")
}

#[tauri::command]
pub async fn get_audio_stream_url(
    room_id: u64,
    state: State<'_, AppState>,
) -> Result<StreamInfo, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state);

    let mut stream_info = api.get_room_play_info(room_id, true).await?;

    // 将流 URL 注册到本地代理服务器
    state
        .stream_proxy
        .set_stream_url(stream_info.stream_url.clone())
        .await?;

    // 填充代理 URL
    stream_info.proxy_url = state.stream_proxy.proxy_url().await?;

    Ok(stream_info)
}

#[tauri::command]
pub async fn clear_audio_stream(state: State<'_, AppState>) -> Result<(), String> {
    state.stream_proxy.clear_stream_url().await
}

#[tauri::command]
pub async fn get_rooms_live_status(state: State<'_, AppState>) -> Result<std::collections::HashMap<u64, bool>, String> {
    let rooms = room_store::load_rooms(state.inner())?;
    let uids: Vec<u64> = rooms.iter().filter_map(|r| r.uid).collect();

    if uids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state);
    api.get_rooms_live_status(&uids).await
}

/// 获取收藏表情列表
#[tauri::command]
pub async fn get_favorite_emoticons(
    account_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Emoticon>, String> {
    Ok(crate::emoticon_store::load_favorites(state.inner(), &account_id))
}

/// 添加收藏表情
#[tauri::command]
pub async fn add_favorite_emoticon(
    account_id: String,
    emoticon: Emoticon,
    state: State<'_, AppState>,
) -> Result<(), String> {
    crate::emoticon_store::add_favorite(state.inner(), &account_id, &emoticon)
}

/// 移除收藏表情
#[tauri::command]
pub async fn remove_favorite_emoticon(
    account_id: String,
    emoticon_unique: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    crate::emoticon_store::remove_favorite(state.inner(), &account_id, &emoticon_unique)
}

/// 更新收藏排序
#[tauri::command]
pub async fn update_favorite_order(
    account_id: String,
    emoticon_unique: String,
    sort_order: i32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    crate::emoticon_store::update_favorite_order(state.inner(), &account_id, &emoticon_unique, sort_order)
}
