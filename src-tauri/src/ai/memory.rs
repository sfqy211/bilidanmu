//! 直播记忆（AI 维护，用户可改）。
//!
//! 两级：`global`（跨直播间）与 `room`（按房间号）。每个 scope 一段 Markdown，
//! 存在主库 `ai_memory` 表里；限长避免把上下文塞爆。不做向量检索与自动事实抽取。

use rusqlite::{params, Connection, OptionalExtension};

/// 单个 scope 允许的最大字符数
pub const MAX_CHARS: usize = 8000;
/// watch_start 自动附带的房间记忆摘要长度
pub const ROOM_SNIPPET_CHARS: usize = 800;
/// watch_start 自动附带的全局记忆摘要长度
pub const GLOBAL_SNIPPET_CHARS: usize = 400;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEntry {
    pub scope: String,
    pub room_id: u64,
    pub content: String,
    pub updated_at: u64,
    pub chars: usize,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySummary {
    pub scope: String,
    pub room_id: u64,
    pub chars: usize,
    pub updated_at: u64,
    pub preview: String,
}

fn normalize(scope: &str, room_id: u64) -> Result<(String, u64), String> {
    match scope {
        "global" => Ok(("global".to_string(), 0)),
        "room" => {
            if room_id == 0 {
                Err("room 记忆需要 roomId（用房间真实房间号）".to_string())
            } else {
                Ok(("room".to_string(), room_id))
            }
        }
        other => Err(format!("scope 只能是 global 或 room，收到 {other}")),
    }
}

fn entry_from(content: String, updated_at: i64, scope: String, room_id: u64) -> MemoryEntry {
    let chars = content.chars().count();
    MemoryEntry {
        scope,
        room_id,
        content,
        updated_at: updated_at.max(0) as u64,
        chars,
    }
}

pub fn get(conn: &Connection, scope: &str, room_id: u64) -> Result<Option<MemoryEntry>, String> {
    let (scope, room_id) = normalize(scope, room_id)?;
    conn.query_row(
        "SELECT content, updated_at FROM ai_memory WHERE scope = ?1 AND room_id = ?2",
        params![scope, room_id as i64],
        |row| {
            let content: String = row.get(0)?;
            let updated_at: i64 = row.get(1)?;
            Ok(entry_from(content, updated_at, scope.clone(), room_id))
        },
    )
    .optional()
    .map_err(|error| format!("读取记忆失败: {error}"))
}

/// 覆盖写入。`content` 不允许为空——清空请用 [`delete`]。
pub fn set(
    conn: &Connection,
    scope: &str,
    room_id: u64,
    content: &str,
) -> Result<MemoryEntry, String> {
    let (scope, room_id) = normalize(scope, room_id)?;
    let content = content.trim();
    if content.is_empty() {
        return Err("内容为空；要清空记忆请用 memory delete".to_string());
    }
    let chars = content.chars().count();
    if chars > MAX_CHARS {
        return Err(format!(
            "记忆 {chars} 字，超过上限 {MAX_CHARS}；请压缩或拆分后再写"
        ));
    }
    let now = crate::ai::context::now_secs().max(0) as u64;
    conn.execute(
        "INSERT INTO ai_memory (scope, room_id, content, updated_at) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(scope, room_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
        params![scope, room_id as i64, content, now as i64],
    )
    .map_err(|error| format!("写入记忆失败: {error}"))?;
    Ok(entry_from(content.to_string(), now as i64, scope, room_id))
}

/// 追加一段。已有内容会保留，用空行分隔。
pub fn append(
    conn: &Connection,
    scope: &str,
    room_id: u64,
    content: &str,
) -> Result<MemoryEntry, String> {
    let (normalized_scope, normalized_room) = normalize(scope, room_id)?;
    let addition = content.trim();
    if addition.is_empty() {
        return Err("追加内容为空".to_string());
    }
    let existing = get(conn, &normalized_scope, normalized_room)?
        .map(|entry| entry.content)
        .unwrap_or_default();
    let merged = if existing.trim().is_empty() {
        addition.to_string()
    } else {
        format!("{}\n\n{}", existing.trim_end(), addition)
    };
    set(conn, &normalized_scope, normalized_room, &merged)
}

pub fn list(conn: &Connection) -> Result<Vec<MemorySummary>, String> {
    let mut statement = conn
        .prepare("SELECT scope, room_id, content, updated_at FROM ai_memory ORDER BY updated_at DESC")
        .map_err(|error| format!("读取记忆列表失败: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            let scope: String = row.get(0)?;
            let room_id: i64 = row.get(1)?;
            let content: String = row.get(2)?;
            let updated_at: i64 = row.get(3)?;
            let preview: String = content.chars().take(80).collect();
            Ok(MemorySummary {
                scope,
                room_id: room_id.max(0) as u64,
                chars: content.chars().count(),
                updated_at: updated_at.max(0) as u64,
                preview,
            })
        })
        .map_err(|error| format!("读取记忆列表失败: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("读取记忆列表失败: {error}"))
}

pub fn delete(conn: &Connection, scope: &str, room_id: u64) -> Result<bool, String> {
    let (scope, room_id) = normalize(scope, room_id)?;
    let affected = conn
        .execute(
            "DELETE FROM ai_memory WHERE scope = ?1 AND room_id = ?2",
            params![scope, room_id as i64],
        )
        .map_err(|error| format!("删除记忆失败: {error}"))?;
    Ok(affected > 0)
}

/// 截断到指定字符数，返回 (片段, 是否截断)。
pub fn snippet(content: &str, max_chars: usize) -> (String, bool) {
    let mut chars = content.chars();
    let text: String = chars.by_ref().take(max_chars).collect();
    (text, chars.next().is_some())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().expect("memory db");
        conn.execute_batch(
            "CREATE TABLE ai_memory (
                scope TEXT NOT NULL,
                room_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (scope, room_id)
            );",
        )
        .expect("schema");
        conn
    }

    #[test]
    fn room_and_global_are_isolated() {
        let conn = db();
        set(&conn, "global", 0, "全局偏好").expect("global");
        set(&conn, "room", 123, "这个主播喜欢打尖塔").expect("room");
        assert_eq!(get(&conn, "global", 0).unwrap().unwrap().content, "全局偏好");
        assert_eq!(
            get(&conn, "room", 123).unwrap().unwrap().content,
            "这个主播喜欢打尖塔"
        );
        assert!(get(&conn, "room", 456).unwrap().is_none());
    }

    #[test]
    fn append_keeps_existing_and_enforces_cap() {
        let conn = db();
        append(&conn, "room", 1, "第一条").expect("append 1");
        let entry = append(&conn, "room", 1, "第二条").expect("append 2");
        assert!(entry.content.contains("第一条"));
        assert!(entry.content.contains("第二条"));

        let big = "字".repeat(MAX_CHARS + 1);
        assert!(set(&conn, "room", 1, &big).is_err());
    }

    #[test]
    fn delete_and_validation() {
        let conn = db();
        set(&conn, "room", 1, "x").expect("set");
        assert!(delete(&conn, "room", 1).expect("delete"));
        assert!(get(&conn, "room", 1).unwrap().is_none());
        assert!(set(&conn, "global", 0, "   ").is_err());
        assert!(set(&conn, "room", 0, "x").is_err());
        assert!(set(&conn, "nope", 1, "x").is_err());
    }

    #[test]
    fn snippet_marks_truncation() {
        let (text, truncated) = snippet("一二三四五", 3);
        assert_eq!(text, "一二三");
        assert!(truncated);
        let (text, truncated) = snippet("一二三", 3);
        assert_eq!(text, "一二三");
        assert!(!truncated);
    }
}
