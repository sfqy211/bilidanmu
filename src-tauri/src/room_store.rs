use crate::models::room::Room;
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "rooms.json";
const STORE_KEY: &str = "rooms";

pub fn load_rooms(app: &tauri::AppHandle) -> Result<Vec<Room>, String> {
    let store = app
        .store_builder(STORE_FILE)
        .build()
        .map_err(|error| format!("创建房间存储失败: {error}"))?;

    let Some(value) = store.get(STORE_KEY) else {
        return Ok(Vec::new());
    };

    serde_json::from_value(value).map_err(|error| format!("读取房间列表失败: {error}"))
}

pub fn save_rooms(app: &tauri::AppHandle, rooms: &[Room]) -> Result<(), String> {
    let store = app
        .store_builder(STORE_FILE)
        .build()
        .map_err(|error| format!("创建房间存储失败: {error}"))?;

    store.set(
        STORE_KEY,
        serde_json::to_value(rooms).map_err(|error| format!("序列化房间列表失败: {error}"))?,
    );

    store
        .save()
        .map_err(|error| format!("保存房间列表失败: {error}"))?;

    Ok(())
}

pub fn upsert_room(app: &tauri::AppHandle, room: &Room) -> Result<(), String> {
    let mut rooms = load_rooms(app)?;
    if let Some(existing) = rooms.iter_mut().find(|item| item.room_id == room.room_id) {
        *existing = room.clone();
    } else {
        rooms.push(room.clone());
    }
    save_rooms(app, &rooms)
}

pub fn remove_room(app: &tauri::AppHandle, room_id: u64) -> Result<(), String> {
    let mut rooms = load_rooms(app)?;
    rooms.retain(|room| room.room_id != room_id);
    save_rooms(app, &rooms)
}
