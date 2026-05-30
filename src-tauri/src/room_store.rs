use crate::db;
use crate::models::room::Room;
use crate::AppState;
use rusqlite::params;

pub fn load_rooms(state: &AppState) -> Result<Vec<Room>, String> {
    db::with_connection(state, |connection| {
        let mut statement = connection
            .prepare(
                "SELECT room_id, uid, title, uname, cover, avatar FROM rooms ORDER BY room_id DESC",
            )
            .map_err(|error| format!("准备查询房间列表失败: {error}"))?;

        let rows = statement
            .query_map([], |row| {
                Ok(Room {
                    id: row.get::<_, u64>(0)?.to_string(),
                    room_id: row.get(0)?,
                    uid: row.get(1)?,
                    title: row.get(2)?,
                    uname: row.get(3)?,
                    cover: row.get(4)?,
                    avatar: row.get(5)?,
                })
            })
            .map_err(|error| format!("查询房间列表失败: {error}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("读取房间列表失败: {error}"))
    })
}

pub fn upsert_room(state: &AppState, room: &Room) -> Result<(), String> {
    db::with_connection(state, |connection| {
        connection
            .execute(
                r#"
                INSERT INTO rooms (room_id, uid, title, uname, cover, avatar)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ON CONFLICT(room_id) DO UPDATE SET
                  uid = excluded.uid,
                  title = excluded.title,
                  uname = excluded.uname,
                  cover = excluded.cover,
                  avatar = excluded.avatar
                "#,
                params![room.room_id, room.uid, room.title, room.uname, room.cover, room.avatar],
            )
            .map_err(|error| format!("保存房间失败: {error}"))?;

        Ok(())
    })
}

pub fn remove_room(state: &AppState, room_id: u64) -> Result<(), String> {
    db::with_connection(state, |connection| {
        connection
            .execute("DELETE FROM rooms WHERE room_id = ?1", params![room_id])
            .map_err(|error| format!("删除房间失败: {error}"))?;
        Ok(())
    })
}
