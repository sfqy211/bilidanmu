use crate::db;
use crate::models::ai::AIModel;
use crate::AppState;
use rusqlite::params;

pub fn load_models(state: &AppState) -> Result<Vec<AIModel>, String> {
    db::with_connection(state, |connection| {
        let mut statement = connection
            .prepare("SELECT id, endpoint, model_name, notes, is_current FROM ai_models ORDER BY rowid DESC")
            .map_err(|error| format!("准备查询 AI 模型失败: {error}"))?;

        let rows = statement
            .query_map([], |row| {
                Ok(AIModel {
                    id: row.get(0)?,
                    endpoint: row.get(1)?,
                    model_name: row.get(2)?,
                    notes: row.get(3)?,
                    is_current: Some(row.get::<_, i64>(4)? != 0),
                })
            })
            .map_err(|error| format!("查询 AI 模型失败: {error}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("读取 AI 模型失败: {error}"))
    })
}

pub fn save_models(state: &AppState, models: &[AIModel]) -> Result<(), String> {
    db::with_connection(state, |connection| {
        let tx = connection
            .unchecked_transaction()
            .map_err(|error| format!("创建 AI 模型事务失败: {error}"))?;

        tx.execute("DELETE FROM ai_models", [])
            .map_err(|error| format!("清空旧 AI 模型失败: {error}"))?;

        {
            let mut statement = tx
                .prepare(
                    "INSERT INTO ai_models (id, endpoint, model_name, notes, is_current) VALUES (?1, ?2, ?3, ?4, ?5)",
                )
                .map_err(|error| format!("准备写入 AI 模型失败: {error}"))?;

            for model in models {
                statement
                    .execute(params![
                        model.id,
                        model.endpoint,
                        model.model_name,
                        model.notes,
                        if model.is_current == Some(true) { 1 } else { 0 },
                    ])
                    .map_err(|error| format!("保存 AI 模型失败: {error}"))?;
            }
        }

        tx.commit().map_err(|error| format!("提交 AI 模型事务失败: {error}"))?;
        Ok(())
    })
}
