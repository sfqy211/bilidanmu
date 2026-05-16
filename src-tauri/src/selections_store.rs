use crate::db;
use crate::AppState;
use rusqlite::params;

pub fn load_values(state: &AppState, keys: &[String]) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    if keys.is_empty() {
        return Ok(serde_json::Map::new());
    }

    db::with_connection(state, |connection| {
        let placeholders = (0..keys.len()).map(|_| "?").collect::<Vec<_>>().join(", ");
        let sql = format!("SELECT key, value FROM app_metadata WHERE key IN ({placeholders})");
        let mut statement = connection
            .prepare(&sql)
            .map_err(|error| format!("准备批量读取选项失败: {error}"))?;

        let mut rows = statement
            .query(rusqlite::params_from_iter(keys.iter()))
            .map_err(|error| format!("批量读取选项失败: {error}"))?;

        let mut result = serde_json::Map::new();
        while let Some(row) = rows.next().map_err(|error| format!("遍历选项失败: {error}"))? {
            let key: String = row.get(0).map_err(|error| format!("读取选项 key 失败: {error}"))?;
            let value_text: String = row.get(1).map_err(|error| format!("读取选项 value 失败: {error}"))?;
            let value = serde_json::from_str(&value_text).map_err(|error| format!("解析选项 {key} 失败: {error}"))?;
            result.insert(key, value);
        }

        for key in keys {
            result.entry(key.clone()).or_insert(serde_json::Value::Null);
        }

        Ok(result)
    })
}

pub fn save_values(state: &AppState, entries: &serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    db::with_connection(state, |connection| {
        let tx = connection
            .unchecked_transaction()
            .map_err(|error| format!("创建选项事务失败: {error}"))?;

        for (key, value) in entries {
            let text = serde_json::to_string(value).map_err(|error| format!("序列化选项 {key} 失败: {error}"))?;
            tx.execute(
                "INSERT INTO app_metadata (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, text],
            )
            .map_err(|error| format!("保存选项 {key} 失败: {error}"))?;
        }

        tx.commit().map_err(|error| format!("提交选项事务失败: {error}"))?;
        Ok(())
    })
}
