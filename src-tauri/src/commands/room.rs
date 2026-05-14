use crate::models::room::{Room, RoomInfo, SearchRoomResult};

#[tauri::command]
pub async fn search_room(query: String, mode: String) -> Result<Vec<SearchRoomResult>, String> {
    Ok(vec![SearchRoomResult {
        room_id: 22625025,
        uid: Some(0),
        uname: format!("示例主播({mode})"),
        title: format!("搜索结果: {query}"),
        cover: None,
        is_live: true,
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
