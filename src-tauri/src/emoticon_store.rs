use crate::db;
use crate::models::room::{Emoticon, EmoticonPackage};
use crate::AppState;
use rusqlite::params;

/// 批量加载房间已缓存的表情包（含表情列表），单次查询避免 N+1
pub fn load_room_packages(state: &AppState, room_id: u64) -> Vec<EmoticonPackage> {
    db::with_connection(state, |connection| {
        // 一次性查出该房间所有包的元数据
        let mut pkg_stmt = connection
            .prepare(
                "SELECT p.pkg_id, p.pkg_name, p.pkg_type, p.current_cover \
                 FROM emoticon_packages p \
                 INNER JOIN room_emoticon_packages r ON r.pkg_id = p.pkg_id \
                 WHERE r.room_id = ?1",
            )
            .map_err(|e| format!("准备查询表情包失败: {e}"))?;

        let pkg_rows: Vec<EmoticonPackage> = pkg_stmt
            .query_map(params![room_id], |row| {
                Ok(EmoticonPackage {
                    pkg_id: row.get(0)?,
                    pkg_name: row.get(1)?,
                    pkg_type: row.get(2)?,
                    current_cover: row.get(3)?,
                    emoticons: Vec::new(),
                })
            })
            .map_err(|e| format!("查询表情包失败: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("读取表情包失败: {e}"))?;

        if pkg_rows.is_empty() {
            return Ok(Vec::new());
        }

        // 一次性查出所有关联的表情
        let placeholders: String = pkg_rows
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect::<Vec<_>>()
            .join(",");

        let sql = format!(
            "SELECT emoji, descript, url, perm, emoticon_unique, emoticon_id, pkg_id, \
             height, width, is_dynamic, unlock_show_text, emoticon_options \
             FROM emoticons WHERE pkg_id IN ({placeholders}) ORDER BY rowid ASC"
        );

        let pkg_ids: Vec<u64> = pkg_rows.iter().map(|p| p.pkg_id).collect();
        let mut stmt = connection
            .prepare(&sql)
            .map_err(|e| format!("准备查询表情失败: {e}"))?;

        let emoticon_rows = stmt
            .query_map(rusqlite::params_from_iter(pkg_ids.iter()), |row| {
                let emoticon_options: Option<String> = row.get(11)?;
                Ok((
                    row.get::<_, u64>(6)?, // pkg_id
                    Emoticon {
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
                            .and_then(|v| serde_json::from_str(&v).ok()),
                    },
                ))
            })
            .map_err(|e| format!("查询表情失败: {e}"))?;

        // 按 pkg_id 分组
        let mut emoticon_map: std::collections::HashMap<u64, Vec<Emoticon>> =
            std::collections::HashMap::new();
        for row in emoticon_rows {
            let (pkg_id, emoticon) = row.map_err(|e| format!("读取表情失败: {e}"))?;
            emoticon_map.entry(pkg_id).or_default().push(emoticon);
        }

        // 组装结果
        let packages: Vec<EmoticonPackage> = pkg_rows
            .into_iter()
            .map(|mut pkg| {
                pkg.emoticons = emoticon_map.remove(&pkg.pkg_id).unwrap_or_default();
                pkg
            })
            .collect();

        Ok(packages)
    })
    .unwrap_or_else(|e| {
        log::warn!("加载房间表情缓存失败: {e}");
        Vec::new()
    })
}

/// 清理房间的非房间专属表情包映射（刷新时调用，保留 pkg_type 2/3）
pub fn clear_non_room_specific_mappings(state: &AppState, room_id: u64) {
    if let Err(e) = db::with_connection(state, |connection| {
        connection
            .execute(
                "DELETE FROM room_emoticon_packages WHERE room_id = ?1 \
                 AND pkg_id IN (SELECT pkg_id FROM emoticon_packages WHERE pkg_type NOT IN (2, 3))",
                params![room_id],
            )
            .map_err(|e| format!("清理旧映射失败: {e}"))?;
        Ok(())
    }) {
        log::warn!("清理旧映射失败: {e}");
    }
}

/// 清理指定房间的全部表情缓存（移除房间时调用）
pub fn clear_room_emoticons(state: &AppState, room_id: u64) -> Result<(), String> {
    db::with_connection(state, |connection| {
        // 1. 删除该房间的所有映射
        connection
            .execute(
                "DELETE FROM room_emoticon_packages WHERE room_id = ?1",
                params![room_id],
            )
            .map_err(|e| format!("清理房间表情映射失败: {e}"))?;

        // 2. 删除不再被任何房间引用的孤立包（CASCADE 自动清理 emoticons 子表）
        connection
            .execute_batch(
                "DELETE FROM emoticon_packages WHERE pkg_id NOT IN \
                 (SELECT DISTINCT pkg_id FROM room_emoticon_packages);",
            )
            .map_err(|e| format!("清理孤立表情包失败: {e}"))?;

        Ok(())
    })
}

/// 清理所有表情缓存
pub fn clear_all(state: &AppState) -> Result<(), String> {
    db::with_connection(state, |connection| {
        // 先删映射表（引用 packages），再删 packages（CASCADE 自动清理 emoticons）
        connection
            .execute_batch(
                "DELETE FROM room_emoticon_packages; DELETE FROM emoticon_packages;",
            )
            .map_err(|error| format!("清理表情缓存失败: {error}"))?;
        Ok(())
    })
}

/// 清理所有房间专属表情包（pkg_type 2/3）及其映射
pub fn clear_room_specific_emoticons(state: &AppState) -> Result<(), String> {
    db::with_connection(state, |connection| {
        // 先删映射表，再删 packages（CASCADE 自动清理 emoticons）
        connection
            .execute_batch(
                "DELETE FROM room_emoticon_packages WHERE pkg_id IN \
                 (SELECT pkg_id FROM emoticon_packages WHERE pkg_type IN (2, 3)); \
                 DELETE FROM emoticon_packages WHERE pkg_type IN (2, 3);",
            )
            .map_err(|error| format!("清理房间专属表情失败: {error}"))?;
        Ok(())
    })
}

/// 批量保存表情包（含表情列表），单次事务
pub fn save_packages(state: &AppState, packages: &[EmoticonPackage]) -> Result<(), String> {
    if packages.is_empty() {
        return Ok(());
    }

    db::with_connection(state, |connection| {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let tx = connection
            .unchecked_transaction()
            .map_err(|e| format!("创建事务失败: {e}"))?;

        let mut statement = tx
            .prepare(
                "INSERT INTO emoticons (emoticon_unique, pkg_id, emoji, descript, url, perm, emoticon_id, height, width, is_dynamic, unlock_show_text, emoticon_options, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            )
            .map_err(|error| format!("准备保存表情失败: {error}"))?;

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
            ).map_err(|error| format!("保存表情包失败: {error}"))?;

            tx.execute("DELETE FROM emoticons WHERE pkg_id = ?1", params![package.pkg_id])
                .map_err(|error| format!("清空旧表情失败: {error}"))?;

            for emoticon in &package.emoticons {
                let unique = emoticon
                    .emoticon_unique
                    .clone()
                    .unwrap_or_else(|| format!("pkg{}_emoticon_{}", package.pkg_id, emoticon.emoticon_id.unwrap_or_default()));

                statement.execute(params![
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
                ]).map_err(|error| format!("保存表情失败: {error}"))?;
            }
        }

        drop(statement);
        tx.commit().map_err(|e| format!("提交事务失败: {e}"))?;
        Ok(())
    })
}

/// 保存房间-表情包映射
pub fn save_room_packages(state: &AppState, room_id: u64, packages: &[EmoticonPackage]) -> Result<(), String> {
    if packages.is_empty() {
        return Ok(());
    }

    db::with_connection(state, |connection| {
        for package in packages {
            connection.execute(
                "INSERT OR IGNORE INTO room_emoticon_packages (room_id, pkg_id) VALUES (?1, ?2)",
                params![room_id, package.pkg_id],
            ).map_err(|error| format!("保存房间表情映射失败: {error}"))?;
        }
        Ok(())
    })
}
