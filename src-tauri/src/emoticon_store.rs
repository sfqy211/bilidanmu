use crate::db;
use crate::models::room::{Emoticon, EmoticonPackage};
use crate::AppState;
use rusqlite::params;

pub fn load_room_packages(state: &AppState, room_id: u64) -> Result<Vec<EmoticonPackage>, String> {
    db::with_connection(state, |connection| {
        let pkg_ids = {
            let mut statement = connection
                .prepare("SELECT pkg_id FROM room_emoticon_packages WHERE room_id = ?1 ORDER BY rowid ASC")
                .map_err(|error| format!("准备查询房间表情索引失败: {error}"))?;

            let rows = statement
                .query_map(params![room_id], |row| row.get::<_, u64>(0))
                .map_err(|error| format!("查询房间表情索引失败: {error}"))?;

            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|error| format!("读取房间表情索引失败: {error}"))?
        };

        if pkg_ids.is_empty() {
            return Ok(Vec::new());
        }

        let mut packages = Vec::new();

        for pkg_id in pkg_ids {
            let package = connection.query_row(
                "SELECT pkg_id, pkg_name, pkg_type, current_cover FROM emoticon_packages WHERE pkg_id = ?1",
                params![pkg_id],
                |row| {
                    Ok(EmoticonPackage {
                        pkg_id: row.get(0)?,
                        pkg_name: row.get(1)?,
                        pkg_type: row.get(2)?,
                        current_cover: row.get(3)?,
                        emoticons: Vec::new(),
                    })
                },
            );

            let mut package = match package {
                Ok(value) => value,
                Err(rusqlite::Error::QueryReturnedNoRows) => continue,
                Err(error) => return Err(format!("读取表情包失败: {error}")),
            };

            let mut statement = connection
                .prepare(
                    "SELECT emoji, descript, url, perm, emoticon_unique, emoticon_id, pkg_id, height, width, is_dynamic, unlock_show_text, emoticon_options FROM emoticons WHERE pkg_id = ?1 ORDER BY rowid ASC",
                )
                .map_err(|error| format!("准备查询表情列表失败: {error}"))?;

            let rows = statement
                .query_map(params![pkg_id], |row| {
                    let emoticon_options: Option<String> = row.get(11)?;
                    Ok(Emoticon {
                        emoji: row.get(0)?,
                        descript: row.get(1)?,
                        url: row.get(2)?,
                        perm: row.get(3)?,
                        emoticon_unique: row.get(4)?,
                        emoticon_id: row.get(5)?,
                        pkg_id: row.get(6)?,
                        height: row.get(7)?,
                        width: row.get(8)?,
                        is_dynamic: row.get(9)?,
                        unlock_show_text: row.get(10)?,
                        emoticon_options: emoticon_options
                            .and_then(|value| serde_json::from_str(&value).ok()),
                    })
                })
                .map_err(|error| format!("查询表情列表失败: {error}"))?;

            package.emoticons = rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| format!("读取表情列表失败: {error}"))?;
            if !package.emoticons.is_empty() {
                packages.push(package);
            }
        }

        Ok(packages)
    })
}

pub fn save_packages(state: &AppState, room_id: u64, packages: &[EmoticonPackage]) -> Result<(), String> {
    if packages.is_empty() {
        return Ok(());
    }

    db::with_connection(state, |connection| {
        let tx = connection
            .unchecked_transaction()
            .map_err(|error| format!("创建表情缓存事务失败: {error}"))?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        tx.execute("DELETE FROM room_emoticon_packages WHERE room_id = ?1", params![room_id])
            .map_err(|error| format!("清空房间表情映射失败: {error}"))?;

        for package in packages {
            tx.execute(
                r#"
                INSERT INTO emoticon_packages (pkg_id, pkg_name, pkg_type, current_cover, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5)
                ON CONFLICT(pkg_id) DO UPDATE SET
                  pkg_name = excluded.pkg_name,
                  pkg_type = excluded.pkg_type,
                  current_cover = excluded.current_cover,
                  updated_at = excluded.updated_at
                "#,
                params![package.pkg_id, package.pkg_name, package.pkg_type, package.current_cover, now],
            )
            .map_err(|error| format!("保存表情包失败: {error}"))?;

            tx.execute(
                "INSERT OR REPLACE INTO room_emoticon_packages (room_id, pkg_id) VALUES (?1, ?2)",
                params![room_id, package.pkg_id],
            )
            .map_err(|error| format!("保存房间表情映射失败: {error}"))?;

            tx.execute("DELETE FROM emoticons WHERE pkg_id = ?1", params![package.pkg_id])
                .map_err(|error| format!("清空旧表情失败: {error}"))?;

            {
                let mut statement = tx
                    .prepare(
                        "INSERT INTO emoticons (emoticon_unique, pkg_id, emoji, descript, url, perm, emoticon_id, height, width, is_dynamic, unlock_show_text, emoticon_options, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                    )
                    .map_err(|error| format!("准备保存表情失败: {error}"))?;

                for emoticon in &package.emoticons {
                    let unique = emoticon
                        .emoticon_unique
                        .clone()
                        .unwrap_or_else(|| format!("pkg{}_emoticon_{}", package.pkg_id, emoticon.emoticon_id.unwrap_or_default()));

                    statement
                        .execute(params![
                            unique,
                            package.pkg_id,
                            emoticon.emoji,
                            emoticon.descript,
                            emoticon.url,
                            emoticon.perm,
                            emoticon.emoticon_id,
                            emoticon.height,
                            emoticon.width,
                            emoticon.is_dynamic,
                            emoticon.unlock_show_text,
                            emoticon.emoticon_options.as_ref().map(|value| value.to_string()),
                            now,
                        ])
                        .map_err(|error| format!("保存表情失败: {error}"))?;
                }
            }
        }

        tx.commit().map_err(|error| format!("提交表情缓存事务失败: {error}"))?;
        Ok(())
    })
}
