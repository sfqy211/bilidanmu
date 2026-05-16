use std::collections::HashMap;
use std::sync::Arc;
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "credential.json";
const COOKIES_KEY: &str = "cookies";
const ACTIVE_KEY: &str = "active_account_id";

fn open_store(app: &tauri::AppHandle) -> Result<Arc<tauri_plugin_store::Store<tauri::Wry>>, String> {
    app.store_builder(STORE_FILE)
        .build()
        .map_err(|error| format!("创建凭据存储失败: {error}"))
}

/// Load all saved cookies as HashMap<uid, cookie_string>
pub fn load_all_cookies(app: &tauri::AppHandle) -> Result<HashMap<String, String>, String> {
    let store = open_store(app)?;

    match store.get(COOKIES_KEY) {
        Some(value) => {
            let map: HashMap<String, String> = serde_json::from_value(value.clone())
                .map_err(|error| format!("解析多账号 Cookie 失败: {error}"))?;
            Ok(map)
        }
        None => {
            // 尝试从旧版单 Cookie 格式迁移
            match store.get("cookie") {
                Some(old_value) => {
                    let cookie = old_value
                        .as_str()
                        .ok_or("存储的 Cookie 格式无效")?
                        .to_string();
                    if cookie.is_empty() {
                        Ok(HashMap::new())
                    } else {
                        // 旧版迁移：无法确定 uid，使用 "legacy" 作为临时键
                        // 前端 restore_login 会通过 API 验证后重新用 uid 保存
                        let mut map = HashMap::new();
                        map.insert("legacy".to_string(), cookie);
                        Ok(map)
                    }
                }
                None => Ok(HashMap::new()),
            }
        }
    }
}

/// Save all cookies
pub fn save_all_cookies(
    app: &tauri::AppHandle,
    cookies: &HashMap<String, String>,
) -> Result<(), String> {
    let store = open_store(app)?;

    let value = serde_json::to_value(cookies)
        .map_err(|error| format!("序列化多账号 Cookie 失败: {error}"))?;
    store.set(COOKIES_KEY, value);

    store
        .save()
        .map_err(|error| format!("保存多账号 Cookie 失败: {error}"))?;

    Ok(())
}

/// Save a single account's cookie (add/update)
pub fn save_cookie(app: &tauri::AppHandle, uid: &str, cookie: &str) -> Result<(), String> {
    let mut cookies = load_all_cookies(app)?;
    cookies.insert(uid.to_string(), cookie.to_string());
    save_all_cookies(app, &cookies)
}

/// Remove a single account's cookie
pub fn remove_cookie(app: &tauri::AppHandle, uid: &str) -> Result<(), String> {
    let mut cookies = load_all_cookies(app)?;
    cookies.remove(uid);
    save_all_cookies(app, &cookies)
}

/// Load the active account ID
pub fn load_active_account_id(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let store = open_store(app)?;

    match store.get(ACTIVE_KEY) {
        Some(value) => {
            let uid = value
                .as_str()
                .ok_or("存储的活跃账号 ID 格式无效")?
                .to_string();
            if uid.is_empty() {
                Ok(None)
            } else {
                Ok(Some(uid))
            }
        }
        None => Ok(None),
    }
}

/// Save the active account ID
pub fn save_active_account_id(app: &tauri::AppHandle, uid: &str) -> Result<(), String> {
    let store = open_store(app)?;

    store.set(ACTIVE_KEY, serde_json::Value::String(uid.to_string()));

    store
        .save()
        .map_err(|error| format!("保存活跃账号 ID 失败: {error}"))?;

    Ok(())
}

/// Clear the active account ID
pub fn clear_active_account_id(app: &tauri::AppHandle) -> Result<(), String> {
    let store = open_store(app)?;

    store.delete(ACTIVE_KEY);

    store
        .save()
        .map_err(|error| format!("清除活跃账号 ID 失败: {error}"))?;

    Ok(())
}


/// 账号元数据（用户名、头像），用于托盘显示
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountMeta {
    pub username: String,
    pub avatar: Option<String>,
}

const META_KEY: &str = "account_metas";

/// Load all account metadata as HashMap<uid, AccountMeta>
pub fn load_account_metas(app: &tauri::AppHandle) -> Result<HashMap<String, AccountMeta>, String> {
    let store = open_store(app)?;

    match store.get(META_KEY) {
        Some(value) => {
            let map: HashMap<String, AccountMeta> = serde_json::from_value(value.clone())
                .map_err(|error| format!("解析账号元数据失败: {error}"))?;
            Ok(map)
        }
        None => Ok(HashMap::new()),
    }
}

/// Save all account metadata
pub fn save_account_metas(app: &tauri::AppHandle, metas: &HashMap<String, AccountMeta>) -> Result<(), String> {
    let store = open_store(app)?;

    let value = serde_json::to_value(metas)
        .map_err(|error| format!("序列化账号元数据失败: {error}"))?;
    store.set(META_KEY, value);

    store
        .save()
        .map_err(|error| format!("保存账号元数据失败: {error}"))?;

    Ok(())
}

/// Save a single account's metadata
pub fn save_account_meta(app: &tauri::AppHandle, uid: &str, meta: &AccountMeta) -> Result<(), String> {
    let mut metas = load_account_metas(app)?;
    metas.insert(uid.to_string(), meta.clone());
    save_account_metas(app, &metas)
}

/// Remove a single account's metadata
pub fn remove_account_meta(app: &tauri::AppHandle, uid: &str) -> Result<(), String> {
    let mut metas = load_account_metas(app)?;
    metas.remove(uid);
    save_account_metas(app, &metas)
}
