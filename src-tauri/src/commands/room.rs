use crate::models::room::{Room, RoomInfo, SearchRoomResult};
use crate::bili::wbi::{extract_wbi_key_from_url, sign_wbi, WbiKeys};
use std::collections::BTreeMap;

#[tauri::command]
pub async fn search_room(query: String, mode: String) -> Result<Vec<SearchRoomResult>, String> {
    let room_id = query
        .chars()
        .filter(|char| char.is_ascii_digit())
        .collect::<String>()
        .parse::<u64>()
        .unwrap_or(22625025);

    let mut params = BTreeMap::new();
    params.insert("id".into(), room_id.to_string());
    params.insert("mode".into(), mode.clone());

    // TODO: 改为从 /x/web-interface/nav 动态拉取并缓存 WBI keys。
    let keys = WbiKeys {
        img_key: extract_wbi_key_from_url(
            "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
        )
        .unwrap_or_default(),
        sub_key: extract_wbi_key_from_url(
            "https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png",
        )
        .unwrap_or_default(),
    };
    let _signed = sign_wbi(params, &keys.mixin_key());

    Ok(vec![SearchRoomResult {
        room_id,
        uid: Some(room_id + 1000),
        uname: format!("{} 搜索结果", mode),
        title: format!("{query} 的直播间"),
        cover: None,
        is_live: mode != "uid",
    }])
}

#[tauri::command]
pub async fn add_room(room_id: u64) -> Result<RoomInfo, String> {
    Ok(RoomInfo::mock(room_id))
}

#[tauri::command]
pub async fn remove_room(_room_id: u64) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn get_room_info(room_id: u64) -> Result<RoomInfo, String> {
    Ok(RoomInfo::mock(room_id))
}

#[tauri::command]
pub async fn get_rooms() -> Result<Vec<Room>, String> {
    Ok(vec![RoomInfo::mock(22625025).into()])
}
