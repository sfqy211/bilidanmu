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
              account_id TEXT NOT NULL DEFAULT '',
              pkg_id INTEGER NOT NULL,
              PRIMARY KEY (room_id, account_id, pkg_id),
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

            CREATE TABLE IF NOT EXISTS favorite_emoticons (
              account_id TEXT NOT NULL,
              emoticon_unique TEXT NOT NULL,
              url TEXT NOT NULL,
              descript TEXT,
              emoji TEXT,
              pkg_id INTEGER,
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at INTEGER NOT NULL,
              PRIMARY KEY (account_id, emoticon_unique)
            );

            CREATE TABLE IF NOT EXISTS image_cache (
              url TEXT PRIMARY KEY,
              data_url TEXT NOT NULL,
              updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS message_templates (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              content TEXT NOT NULL,
              created_at INTEGER NOT NULL
            );
            "#,
        )
        .map_err(|error| format!("初始化 SQLite 数据库失败: {error}"))?;

    // 迁移: 移除 rooms.is_live 列（直播状态改为实时查询，不再持久化）
    // SQLite 3.35+ 支持 DROP COLUMN，旧版本静默忽略
    let _ = connection.execute_batch("ALTER TABLE rooms DROP COLUMN is_live");

    // 迁移: 添加主播头像列
    let _ = connection.execute_batch("ALTER TABLE rooms ADD COLUMN avatar TEXT");

    // 迁移: 添加房间排序值列（拖拽排序）。ALTER 成功 = 列刚加上，此时为存量房间
    // 一次性编号：room_id 越大（添加越晚）sort_order 越小、排在前（对齐既有展示顺序）。
    // 只在该分支执行，避免每次启动都覆盖用户拖拽出的自定义顺序。
    if connection
        .execute_batch("ALTER TABLE rooms ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
        .is_ok()
    {
        let _ = connection.execute(
            "UPDATE rooms SET sort_order = (SELECT COUNT(*) FROM rooms AS r2 WHERE r2.room_id >= rooms.room_id)",
            [],
        );
    }

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
