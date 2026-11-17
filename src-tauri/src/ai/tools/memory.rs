//! 记忆工具：房间 / 全局两级 Markdown，AI 维护、用户可改。
//!
//! 设计与 [crate::ai::memory] 对齐：不做向量检索，靠 scope + roomId 定位。

use super::args;
use crate::ai::memory;
use crate::ai::spec::ToolError;
use crate::AppState;
use serde_json::{json, Value};

fn with_db<T>(
    state: &AppState,
    action: impl FnOnce(&rusqlite::Connection) -> Result<T, String>,
) -> Result<T, ToolError> {
    let guard = state
        .db
        .lock()
        .map_err(|_| ToolError::failed("数据库锁获取失败"))?;
    let connection = guard
        .as_ref()
        .ok_or_else(|| ToolError::failed("数据库尚未初始化"))?;
    action(connection).map_err(ToolError::failed)
}

fn scope_args(raw: &Value) -> Result<(String, u64), ToolError> {
    let scope = args::string(raw, "scope")?;
    let room_id = args::opt_u64(raw, "roomId").unwrap_or(0);
    Ok((scope, room_id))
}

/// 读取某个 scope 的完整记忆。
pub async fn get(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &Value,
) -> Result<Value, ToolError> {
    let (scope, room_id) = scope_args(raw)?;
    let entry = with_db(state, |connection| memory::get(connection, &scope, room_id))?;
    Ok(match entry {
        Some(entry) => json!({ "found": true, "memory": entry }),
        None => json!({
            "found": false,
            "hint": "这个范围还没有记忆；需要时用 memory set/append 写入"
        }),
    })
}

/// 覆盖写入。
pub async fn set(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &Value,
) -> Result<Value, ToolError> {
    let (scope, room_id) = scope_args(raw)?;
    let content = args::string(raw, "content")?;
    let entry = with_db(state, |connection| {
        memory::set(connection, &scope, room_id, &content)
    })?;
    Ok(json!({
        "saved": true,
        "scope": entry.scope,
        "roomId": entry.room_id,
        "chars": entry.chars,
        "updatedAt": entry.updated_at,
    }))
}

/// 追加一段（保留已有内容）。
pub async fn append(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &Value,
) -> Result<Value, ToolError> {
    let (scope, room_id) = scope_args(raw)?;
    let content = args::string(raw, "content")?;
    let entry = with_db(state, |connection| {
        memory::append(connection, &scope, room_id, &content)
    })?;
    Ok(json!({
        "appended": true,
        "scope": entry.scope,
        "roomId": entry.room_id,
        "chars": entry.chars,
        "updatedAt": entry.updated_at,
    }))
}

/// 列出全部记忆摘要。
pub async fn list(
    _app: &tauri::AppHandle,
    state: &AppState,
    _raw: &Value,
) -> Result<Value, ToolError> {
    let memories = with_db(state, |connection| memory::list(connection))?;
    Ok(json!({ "count": memories.len(), "memories": memories }))
}

/// 删除某个 scope 的记忆。
pub async fn delete(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &Value,
) -> Result<Value, ToolError> {
    let (scope, room_id) = scope_args(raw)?;
    let deleted = with_db(state, |connection| {
        memory::delete(connection, &scope, room_id)
    })?;
    Ok(json!({ "deleted": deleted, "scope": scope, "roomId": room_id }))
}
