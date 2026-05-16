use crate::AppState;
use rusqlite::Connection;
use std::fs;
use tauri::Manager;

pub fn open_database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("获取应用数据目录失败: {error}"))?;

    fs::create_dir_all(&app_data_dir).map_err(|error| format!("创建应用数据目录失败: {error}"))?;

    let db_path = app_data_dir.join("bilidanmu.db");
    let connection = Connection::open(db_path).map_err(|error| format!("打开 SQLite 数据库失败: {error}"))?;

    initialize_database(&connection)?;
    Ok(connection)
}

fn initialize_database(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS app_metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS rooms (
              room_id INTEGER PRIMARY KEY,
              uid INTEGER,
              title TEXT NOT NULL,
              uname TEXT NOT NULL,
              cover TEXT
            );

            CREATE TABLE IF NOT EXISTS ai_models (
              id TEXT PRIMARY KEY,
              endpoint TEXT NOT NULL,
              model_name TEXT NOT NULL,
              notes TEXT,
              is_current INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS emoticon_packages (
              pkg_id INTEGER PRIMARY KEY,
              pkg_name TEXT NOT NULL,
              pkg_type INTEGER,
              current_cover TEXT,
              updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS room_emoticon_packages (
              room_id INTEGER NOT NULL,
              pkg_id INTEGER NOT NULL,
              PRIMARY KEY (room_id, pkg_id),
              FOREIGN KEY(pkg_id) REFERENCES emoticon_packages(pkg_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS emoticons (
              emoticon_unique TEXT PRIMARY KEY,
              pkg_id INTEGER NOT NULL,
              emoji TEXT,
              descript TEXT,
              url TEXT NOT NULL,
              perm INTEGER,
              emoticon_id INTEGER,
              height INTEGER,
              width INTEGER,
              is_dynamic INTEGER,
              unlock_show_text TEXT,
              emoticon_options TEXT,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY(pkg_id) REFERENCES emoticon_packages(pkg_id) ON DELETE CASCADE
            );
            "#,
        )
        .map_err(|error| format!("初始化 SQLite 数据库失败: {error}"))?;

    // 迁移: 移除 rooms.is_live 列（直播状态改为实时查询，不再持久化）
    // SQLite 3.35+ 支持 DROP COLUMN，旧版本静默忽略
    let _ = connection.execute_batch("ALTER TABLE rooms DROP COLUMN is_live");

    Ok(())
}

pub fn with_connection<T, F>(state: &AppState, handler: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    let guard = state
        .db
        .lock()
        .map_err(|_| "获取 SQLite 连接锁失败".to_string())?;

    let connection = guard
        .as_ref()
        .ok_or_else(|| "SQLite 数据库尚未初始化".to_string())?;

    handler(connection)
}
