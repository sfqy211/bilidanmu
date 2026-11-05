use crate::db;
use crate::models::room::Room;
use crate::AppState;
use rusqlite::params;
use std::collections::HashMap;

pub fn load_rooms(state: &AppState) -> Result<Vec<Room>, String> {
    db::with_connection(state, |connection| {
        let mut statement = connection
            .prepare(
                "SELECT room_id, uid, title, uname, cover, avatar, sort_order, last_live_start FROM rooms ORDER BY sort_order ASC, room_id DESC",
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
                    sort_order: row.get(6)?,
                    last_live_start: row.get(7)?,
                })
            })
            .map_err(|error| format!("查询房间列表失败: {error}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("读取房间列表失败: {error}"))
    })
}

pub fn get_room_display_info(state: &AppState, room_id: u64) -> Option<(String, String)> {
    db::with_connection(state, |connection| {
        connection
            .query_row(
                "SELECT uname, title FROM rooms WHERE room_id = ?1",
                params![room_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .map_err(|error| format!("查询房间信息失败: {error}"))
    })
    .ok()
}

pub fn upsert_room(state: &AppState, room: &Room) -> Result<(), String> {
    db::with_connection(state, |connection| {
        connection
            .execute(
                r#"
                INSERT INTO rooms (room_id, uid, title, uname, cover, avatar, sort_order)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, COALESCE((SELECT MIN(sort_order) FROM rooms), 1) - 1)
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

/// 回填各主播最近一次的开播起始时间（uid -> 秒级时间戳）。
/// 只更新与库内值不同的行：60s 轮询反复调用时绝大多数时候是零写入。
/// B 站接口对未开播房间不提供该信息，因此这里只增不删——下播后保留上一场的开播时间。
pub fn update_last_live_starts(state: &AppState, starts: &HashMap<u64, i64>) {
    if starts.is_empty() {
        return;
    }
    let result = db::with_connection(state, |connection| {
        let mut statement = connection
            .prepare(
                "UPDATE rooms SET last_live_start = ?1 WHERE uid = ?2 AND (last_live_start IS NULL OR last_live_start != ?1)",
            )
            .map_err(|error| format!("准备回填上次开播时间失败: {error}"))?;
        for (uid, start) in starts {
            statement
                .execute(params![start, uid])
                .map_err(|error| format!("回填上次开播时间失败: {error}"))?;
        }
        Ok(())
    });
    // 回填只是展示辅助，失败不影响主流程
    if let Err(error) = result {
        log::warn!("回填上次开播时间失败: {error}");
    }
}

/// 按给定顺序重排房间（sort_order = 下标）。
/// 给定的应是完整显示顺序（直播中在前），之后直播状态变化时各组内仍按该自定义顺序排列。
pub fn reorder_rooms(state: &AppState, room_ids: &[u64]) -> Result<(), String> {
    db::with_connection(state, |connection| {
        let tx = connection
            .unchecked_transaction()
            .map_err(|error| format!("开启排序事务失败: {error}"))?;

        for (index, room_id) in room_ids.iter().enumerate() {
            tx.execute(
                "UPDATE rooms SET sort_order = ?1 WHERE room_id = ?2",
                params![index as i64, room_id],
            )
            .map_err(|error| format!("更新房间排序失败: {error}"))?;
        }

        tx.commit()
            .map_err(|error| format!("提交房间排序失败: {error}"))?;
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
