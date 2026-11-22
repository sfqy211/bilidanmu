use crate::AppState;
use crate::{locale::Locale, models::settings::Settings};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

const SETTINGS_KEY: &str = "settings";

pub fn load_settings(state: &AppState) -> Result<Settings, String> {
    crate::db::with_connection(state, |connection| match read_settings(connection)? {
        Some(json) => serde_json::from_str(&json).map_err(|e| format!("解析设置失败: {e}")),
        None => Ok(Settings::default()),
    })
}

pub fn save_settings(state: &AppState, settings: &Settings) -> Result<(), String> {
    crate::db::with_connection(state, |connection| {
        save_settings_preserving_locale(connection, settings)
    })
}

pub fn load_locale(state: &AppState) -> Locale {
    crate::db::with_connection(state, read_locale).unwrap_or_default()
}

pub fn save_locale(state: &AppState, locale: Locale) -> Result<bool, String> {
    crate::db::with_connection(state, |connection| save_locale_value(connection, locale))
}

fn read_settings(connection: &Connection) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT value FROM app_metadata WHERE key = ?1",
            params![SETTINGS_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("读取设置失败: {error}"))
}

fn read_settings_value(connection: &Connection) -> Result<Option<Value>, String> {
    read_settings(connection)?
        .map(|json| serde_json::from_str(&json).map_err(|error| format!("解析设置失败: {error}")))
        .transpose()
}

fn read_locale(connection: &Connection) -> Result<Locale, String> {
    Ok(read_settings_value(connection)?
        .as_ref()
        .map(|settings| Locale::from_settings_value(&settings["locale"]))
        .unwrap_or_default())
}

fn save_settings_preserving_locale(
    connection: &Connection,
    settings: &Settings,
) -> Result<(), String> {
    let mut settings = settings.clone();
    settings.locale = read_locale(connection)?;
    write_settings(connection, &settings)
}

fn save_locale_value(connection: &Connection, locale: Locale) -> Result<bool, String> {
    let mut settings = match read_settings_value(connection)? {
        Some(settings) => settings,
        None => serde_json::to_value(Settings::default())
            .map_err(|error| format!("序列化设置失败: {error}"))?,
    };
    let fields = settings.as_object_mut().ok_or("设置必须为 JSON 对象")?;
    let previous = fields
        .get("locale")
        .and_then(Value::as_str)
        .and_then(Locale::parse);
    if previous == Some(locale) {
        return Ok(false);
    }
    fields.insert("locale".into(), serde_json::json!(locale));
    write_settings(connection, &settings)?;
    Ok(previous.unwrap_or_default() != locale)
}

fn write_settings(connection: &Connection, settings: &impl serde::Serialize) -> Result<(), String> {
    let json =
        serde_json::to_string(settings).map_err(|error| format!("序列化设置失败: {error}"))?;
    connection
        .execute(
            "INSERT INTO app_metadata (key, value) VALUES (?1, ?2) \
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![SETTINGS_KEY, json],
        )
        .map_err(|error| format!("保存设置失败: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn database() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch("CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            .unwrap();
        connection
    }

    #[test]
    fn legacy_locale_values_only_default_the_locale_field() {
        let mut settings = serde_json::to_value(Settings::default()).unwrap();
        settings["silentStart"] = json!(true);
        for locale in [
            None,
            Some(Value::Null),
            Some(json!("unsupported")),
            Some(json!(42)),
        ] {
            let fields = settings.as_object_mut().unwrap();
            if let Some(locale) = locale {
                fields.insert("locale".into(), locale);
            } else {
                fields.remove("locale");
            }
            let loaded: Settings = serde_json::from_value(settings.clone()).unwrap();
            assert_eq!(loaded.locale, Locale::ZhCn);
            assert!(loaded.silent_start);
        }
    }

    #[test]
    fn locale_only_updates_its_field_and_survives_a_stale_settings_save() {
        let connection = database();
        let mut stored = serde_json::to_value(Settings::default()).unwrap();
        stored["futureSetting"] = json!({"items": [1, 2]});
        write_settings(&connection, &stored).unwrap();
        assert!(save_locale_value(&connection, Locale::En).unwrap());
        assert!(!save_locale_value(&connection, Locale::En).unwrap());
        stored["locale"] = json!("en");
        assert_eq!(read_settings_value(&connection).unwrap(), Some(stored));

        let stale = Settings {
            silent_start: true,
            ..Settings::default()
        };
        save_settings_preserving_locale(&connection, &stale).unwrap();
        let saved: Settings =
            serde_json::from_str(&read_settings(&connection).unwrap().unwrap()).unwrap();
        assert_eq!(saved.locale, Locale::En);
        assert!(saved.silent_start);
    }

    #[test]
    fn failed_locale_write_keeps_the_saved_language() {
        let connection = database();
        assert!(save_locale_value(&connection, Locale::En).unwrap());
        connection
            .execute_batch(
                "CREATE TRIGGER reject_update BEFORE UPDATE ON app_metadata
                            BEGIN SELECT RAISE(ABORT, 'rejected'); END;",
            )
            .unwrap();
        assert!(save_locale_value(&connection, Locale::ZhCn).is_err());
        assert_eq!(read_locale(&connection).unwrap(), Locale::En);
    }
}
