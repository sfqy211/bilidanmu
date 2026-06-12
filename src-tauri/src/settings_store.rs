use crate::models::settings::Settings;
use crate::AppState;
use rusqlite::params;

const SETTINGS_KEY: &str = "settings";

pub fn load_settings(state: &AppState) -> Result<Settings, String> {
    crate::db::with_connection(state, |connection| {
        let result = connection.query_row(
            "SELECT value FROM app_metadata WHERE key = ?1",
            params![SETTINGS_KEY],
            |row| row.get::<_, String>(0),
        );
        match result {
            Ok(json) => {
                serde_json::from_str(&json).map_err(|e| format!("解析设置失败: {e}"))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(Settings::default()),
            Err(e) => Err(format!("读取设置失败: {e}")),
        }
    })
}

pub fn save_settings(state: &AppState, settings: &Settings) -> Result<(), String> {
    let json =
        serde_json::to_string(settings).map_err(|e| format!("序列化设置失败: {e}"))?;
    crate::db::with_connection(state, |connection| {
        connection
            .execute(
                "INSERT INTO app_metadata (key, value) VALUES (?1, ?2) \
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![SETTINGS_KEY, json],
            )
            .map_err(|e| format!("保存设置失败: {e}"))?;
        Ok(())
    })
}
