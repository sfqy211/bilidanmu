use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "credential.json";
const COOKIE_KEY: &str = "cookie";

pub fn load_cookie(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let store = app
        .store_builder(STORE_FILE)
        .build()
        .map_err(|error| format!("创建凭据存储失败: {error}"))?;

    match store.get(COOKIE_KEY) {
        Some(value) => {
            let cookie = value
                .as_str()
                .ok_or("存储的 Cookie 格式无效")?
                .to_string();
            if cookie.is_empty() {
                Ok(None)
            } else {
                Ok(Some(cookie))
            }
        }
        None => Ok(None),
    }
}

pub fn save_cookie(app: &tauri::AppHandle, cookie: &str) -> Result<(), String> {
    let store = app
        .store_builder(STORE_FILE)
        .build()
        .map_err(|error| format!("创建凭据存储失败: {error}"))?;

    store.set(COOKIE_KEY, serde_json::Value::String(cookie.to_string()));

    store
        .save()
        .map_err(|error| format!("保存 Cookie 失败: {error}"))?;

    Ok(())
}

pub fn clear_cookie(app: &tauri::AppHandle) -> Result<(), String> {
    let store = app
        .store_builder(STORE_FILE)
        .build()
        .map_err(|error| format!("创建凭据存储失败: {error}"))?;

    store.remove(COOKIE_KEY);

    store
        .save()
        .map_err(|error| format!("清除 Cookie 失败: {error}"))?;

    Ok(())
}
