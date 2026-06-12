use crate::db;
use crate::AppState;
use crate::bili::unix_secs;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageTemplate {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub created_at: i64,
}

pub fn list_templates(state: &AppState) -> Result<Vec<MessageTemplate>, String> {
    db::with_connection(state, |connection| {
        let mut stmt = connection
            .prepare("SELECT id, title, content, created_at FROM message_templates ORDER BY created_at DESC")
            .map_err(|error| format!("准备查询消息模板失败: {error}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(MessageTemplate {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .map_err(|error| format!("查询消息模板失败: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("读取消息模板列表失败: {error}"))
    })
}

pub fn insert_template(state: &AppState, title: &str, content: &str) -> Result<i64, String> {
    db::with_connection(state, |connection| {
        let now = unix_secs() as i64;
        connection
            .execute(
                "INSERT INTO message_templates (title, content, created_at) VALUES (?1, ?2, ?3)",
                params![title, content, now],
            )
            .map_err(|error| format!("插入消息模板失败: {error}"))?;
        Ok(connection.last_insert_rowid())
    })
}

pub fn update_template(state: &AppState, id: i64, title: &str, content: &str) -> Result<(), String> {
    db::with_connection(state, |connection| {
        connection
            .execute(
                "UPDATE message_templates SET title = ?1, content = ?2 WHERE id = ?3",
                params![title, content, id],
            )
            .map_err(|error| format!("更新消息模板失败: {error}"))?;
        Ok(())
    })
}

pub fn delete_template(state: &AppState, id: i64) -> Result<(), String> {
    db::with_connection(state, |connection| {
        connection
            .execute("DELETE FROM message_templates WHERE id = ?1", params![id])
            .map_err(|error| format!("删除消息模板失败: {error}"))?;
        Ok(())
    })
}
