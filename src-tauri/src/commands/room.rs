use crate::commands::build_api_client;
use crate::models::room::{EmoticonPackage, Room, RoomInfo, SearchRoomResult};
use crate::models::stream::StreamInfo;
use crate::room_store;
use crate::tray;
use crate::AppState;
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub async fn search_room(
    query: String,
    mode: String,
    state: State<'_, AppState>,
) -> Result<Vec<SearchRoomResult>, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state)?;

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
    let api = build_api_client(credential, &state)?;
    let room = api.get_room_info(room_id).await?;
    room_store::upsert_room(state.inner(), &room.room)?;
    let _ = tray::refresh_tray(&app);
    Ok(room)
}

#[tauri::command]
pub async fn remove_room(app: tauri::AppHandle, room_id: u64, state: State<'_, AppState>) -> Result<(), String> {
    room_store::remove_room(state.inner(), room_id)?;
    let _ = tray::refresh_tray(&app);
    Ok(())
}

#[tauri::command]
pub async fn get_room_info(room_id: u64, state: State<'_, AppState>) -> Result<RoomInfo, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state)?;
    api.get_room_info(room_id).await
}

#[tauri::command]
pub async fn get_rooms(state: State<'_, AppState>) -> Result<Vec<Room>, String> {
    room_store::load_rooms(state.inner())
}

#[tauri::command]
pub async fn get_emoticons(
    room_id: u64,
    state: State<'_, AppState>,
) -> Result<Vec<EmoticonPackage>, String> {
    if let Ok(cached) = crate::emoticon_store::load_room_packages(state.inner(), room_id) {
        if !cached.is_empty() {
            return Ok(cached);
        }
    }

    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state)?;
    let packages = api.get_emoticons(room_id).await?;
    let _ = crate::emoticon_store::save_packages(state.inner(), room_id, &packages);
    Ok(packages)
}

#[tauri::command]
pub async fn open_danmaku_window(app: tauri::AppHandle, room_id: u64) -> Result<(), String> {
    let label = format!("danmaku-{room_id}");

    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    let path = format!("/danmaku/{room_id}")
        .parse()
        .map_err(|error| format!("解析弹幕窗口路由失败: {error}"))?;

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(path))
        .title(format!("弹幕 - 房间 {room_id}"))
        .inner_size(420.0, 320.0)
        .min_inner_size(240.0, 160.0)
        .max_inner_size(1200.0, 900.0)
        .resizable(true)
        .decorations(true)
        .transparent(true)
        .always_on_top(true)
        .shadow(false)
        .build()
        .map_err(|error| error.to_string())?;

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
    let api = build_api_client(credential, &state)?;

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
    let api = build_api_client(credential, &state)?;
    api.get_rooms_live_status(&uids).await
}
