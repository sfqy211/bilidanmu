use crate::bili::api::BiliApiClient;
use crate::bili::credential::BiliCredential;
use crate::models::room::{Room, RoomInfo, SearchRoomResult};
use crate::AppState;
use tauri::State;

fn build_api_client(
    credential: Option<BiliCredential>,
    state: &State<'_, AppState>,
) -> Result<BiliApiClient, String> {
    BiliApiClient::new(credential, state.wbi_cache.clone()).map_err(|error| error.to_string())
}

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
            let room_id = extract_number(&query, "房间号")
                .ok()
                .filter(|value| *value > 0)
                .unwrap_or(22625025);
            let room = api.get_room_info(room_id).await?;
            Ok(vec![SearchRoomResult {
                room_id: room.room.room_id,
                uid: room.room.uid,
                uname: if room.room.uname.is_empty() {
                    query.clone()
                } else {
                    room.room.uname.clone()
                },
                title: room.room.title.clone(),
                cover: room.room.cover.clone(),
                is_live: room.room.is_live,
            }])
        }
        _ => Err("不支持的搜索模式".to_string()),
    }
}

#[tauri::command]
pub async fn add_room(room_id: u64, state: State<'_, AppState>) -> Result<RoomInfo, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state)?;
    api.get_room_info(room_id).await
}

#[tauri::command]
pub async fn remove_room(_room_id: u64) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn get_room_info(room_id: u64, state: State<'_, AppState>) -> Result<RoomInfo, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state)?;
    api.get_room_info(room_id).await
}

#[tauri::command]
pub async fn get_rooms() -> Result<Vec<Room>, String> {
    Ok(vec![RoomInfo::mock(22625025).into()])
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
