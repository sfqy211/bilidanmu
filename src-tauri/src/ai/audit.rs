//! AI 工具调用审计：每次调用落一条记录，供 AIPage 展示与后续做 eval 数据集。

use crate::db;
use crate::AppState;
use rusqlite::params;

/// 写一条审计记录。失败只记日志，不影响工具调用本身。
pub fn record(
    state: &AppState,
    tool: &str,
    origin: &str,
    args: &serde_json::Value,
    ok: bool,
    summary: &str,
    duration_ms: u64,
) {
    let args_text = serde_json::to_string(args).unwrap_or_else(|_| "{}".to_string());
    // 审计表不该被单个超大参数撑爆：超长直接截断
    let args_text = truncate(&args_text, 2000);
    let summary = truncate(summary, 500);
    let created_at = chrono::Utc::now().timestamp_millis();

    let result = db::with_connection(state, |connection| {
        connection
            .execute(
                "INSERT INTO ai_audit (tool, origin, args, ok, summary, duration_ms, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![tool, origin, args_text, ok as i32, summary, duration_ms as i64, created_at],
            )
            .map_err(|error| format!("写入工具审计失败: {error}"))?;
        Ok(())
    });

    if let Err(error) = result {
        log::warn!("[ai] {error}");
    }
}

/// 读取最近 N 条审计记录，最新的在前。
pub fn list(state: &AppState, limit: usize) -> Result<Vec<serde_json::Value>, String> {
    db::with_connection(state, |connection| {
        let mut statement = connection
            .prepare(
                "SELECT tool, origin, args, ok, summary, duration_ms, created_at \
                 FROM ai_audit ORDER BY id DESC LIMIT ?1",
            )
            .map_err(|error| format!("准备查询工具审计失败: {error}"))?;
        let rows = statement
            .query_map(params![limit as i64], |row| {
                let args: String = row.get(2)?;
                Ok(serde_json::json!({
                    "tool": row.get::<_, String>(0)?,
                    "origin": row.get::<_, String>(1)?,
                    "args": serde_json::from_str::<serde_json::Value>(&args)
                        .unwrap_or(serde_json::Value::Null),
                    "ok": row.get::<_, i32>(3)? != 0,
                    "summary": row.get::<_, String>(4)?,
                    "durationMs": row.get::<_, i64>(5)?,
                    "createdAt": row.get::<_, i64>(6)?,
                }))
            })
            .map_err(|error| format!("查询工具审计失败: {error}"))?;
        let mut records = Vec::new();
        for row in rows {
            records.push(row.map_err(|error| format!("读取工具审计行失败: {error}"))?);
        }
        Ok(records)
    })
}

pub fn clear(state: &AppState) -> Result<(), String> {
    db::with_connection(state, |connection| {
        connection
            .execute("DELETE FROM ai_audit", [])
            .map_err(|error| format!("清空工具审计失败: {error}"))?;
        Ok(())
    })
}

/// 按字符边界截断，避免把多字节 UTF-8 切成半个字符。
fn truncate(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let mut out: String = text.chars().take(max_chars).collect();
    out.push('…');
    out
}
