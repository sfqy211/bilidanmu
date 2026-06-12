use crate::models::account::Credential;
use crate::bili::buvid::ensure_buvid;
use crate::bili::credential::{BiliCredential, ANONYMOUS_ACCOUNT_ID};
use crate::commands::build_api_client;
use crate::tray;
use crate::{credential_store, AppState};
use log::warn;
use tauri::{Emitter, State};

#[tauri::command]
pub async fn login_by_qr(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = state.proxy_client.clone();

    let response = client
        .get("https://passport.bilibili.com/x/passport-login/web/qrcode/generate")
        .header("Referer", crate::bili::BILI_REFERER)
        .send()
        .await
        .map_err(|error| format!("获取二维码失败: {error}"))?;

    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|error| format!("解析二维码响应失败: {error}"))?;

    let code = json.get("code").and_then(serde_json::Value::as_i64).unwrap_or(-1);
    if code != 0 {
        return Err(json
            .get("message")
            .or_else(|| json.get("msg"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("获取二维码失败")
            .to_string());
    }

    let data = json.get("data").ok_or_else(|| "二维码响应缺少 data 字段".to_string())?;
    Ok(serde_json::json!({
        "url": data.get("url").and_then(serde_json::Value::as_str).unwrap_or_default(),
        "qrcodeKey": data.get("qrcode_key").and_then(serde_json::Value::as_str).unwrap_or_default()
    }))
}

#[tauri::command]
pub async fn poll_qr(
    app: tauri::AppHandle,
    qrcode_key: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client = state.proxy_client.clone();

    let response = client
        .get("https://passport.bilibili.com/x/passport-login/web/qrcode/poll")
        .header("Referer", crate::bili::BILI_REFERER)
        .query(&[("qrcode_key", qrcode_key)])
        .send()
        .await
        .map_err(|error| format!("轮询二维码状态失败: {error}"))?;

    let headers = response.headers().clone();
    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|error| format!("解析二维码轮询响应失败: {error}"))?;

    let outer_code = json.get("code").and_then(serde_json::Value::as_i64).unwrap_or(-1);
    if outer_code != 0 {
        return Err(json
            .get("message")
            .or_else(|| json.get("msg"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("二维码轮询失败")
            .to_string());
    }

    let data = json.get("data").ok_or_else(|| "二维码轮询响应缺少 data 字段".to_string())?;
    let status_code = data.get("code").and_then(serde_json::Value::as_i64).unwrap_or(-1);

    match status_code {
        0 => {
            let cookie = headers
                .get_all(reqwest::header::SET_COOKIE)
                .iter()
                .filter_map(|value| value.to_str().ok())
                .filter_map(|value| value.split(';').next())
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join("; ");

            let credential = complete_login_with_cookie(&app, &state, cookie).await?;
            Ok(serde_json::json!({
                "status": "success",
                "message": "扫码登录成功",
                "credential": credential,
            }))
        }
        86038 => Ok(serde_json::json!({
            "status": "expired",
            "message": data.get("message").and_then(serde_json::Value::as_str).unwrap_or("二维码已过期"),
        })),
        86090 => Ok(serde_json::json!({
            "status": "scanned",
            "message": data.get("message").and_then(serde_json::Value::as_str).unwrap_or("已扫码，等待确认"),
        })),
        _ => Ok(serde_json::json!({
            "status": "pending",
            "message": data.get("message").and_then(serde_json::Value::as_str).unwrap_or("等待扫码"),
        })),
    }
}

#[tauri::command]
pub async fn login_by_cookie(
    app: tauri::AppHandle,
    cookie: String,
    state: State<'_, AppState>,
) -> Result<Credential, String> {
    complete_login_with_cookie(&app, &state, cookie).await
}

async fn complete_login_with_cookie(
    app: &tauri::AppHandle,
    state: &State<'_, AppState>,
    cookie: String,
) -> Result<Credential, String> {
    let mut parsed = BiliCredential::from_cookie_str(&cookie);
    ensure_buvid(&mut parsed);
    parsed.validate_for_send()?;

    // 先通过 API 获取账号信息，确认 uid
    let api = build_api_client(Some(parsed.clone()), &state);
    let login_status = api.verify_login_status().await?;

    let uid = if let Some(ref account) = login_status.account {
        account.uid.to_string()
    } else {
        // fallback to DedeUserID from cookie
        parsed
            .dede_user_id
            .as_deref()
            .ok_or_else(|| "无法从 Cookie 中获取用户 ID".to_string())?
            .to_string()
    };

    // 保存到所有账号 map（登录只添加账号，不切换活跃账号）
    {
        let mut credentials = state.credentials.lock().unwrap();
        credentials.insert(uid.clone(), parsed.clone());
    }

    // 持久化保存 cookie
    credential_store::save_cookie(&app, &uid, &cookie)?;

    // 保存账号元数据（用户名、头像）用于托盘显示
    {
        let meta = credential_store::AccountMeta {
            username: if let Some(ref account) = login_status.account {
                account.username.clone()
            } else {
                format!("账号 {}", uid)
            },
            avatar: login_status.account.as_ref().and_then(|a| a.avatar.clone()),
        };
        credential_store::save_account_meta(&app, &uid, &meta)?;
        let mut account_metas = state.account_metas.lock().unwrap();
        account_metas.insert(uid.clone(), meta);
    }

    // 清理旧版迁移残留的 "legacy" key
    {
        let mut cookies = credential_store::load_all_cookies(&app).unwrap_or_default();
        if cookies.remove("legacy").is_some() {
            credential_store::save_all_cookies(&app, &cookies)?;
        }
    }

    let _ = tray::refresh_tray(&app);

    // 构建返回的 Credential
    let mut credential = Credential::mock();
    if let Some(account) = login_status.account {
        credential.account_id = account.id;
        credential.uid = account.uid;
        credential.username = account.username;
        credential.avatar = account.avatar;
    } else {
        credential.uid = parsed
            .dede_user_id
            .as_deref()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(credential.uid);
        credential.username = "Bilibili 用户".to_string();
    }
    credential.cookie = parsed.cookie_header();
    credential.bili_jct = parsed.bili_jct.clone();
    Ok(credential)
}

// ── TV 扫码登录（获取 access_key） ──

use crate::bili::APPKEY as TV_APPKEY;

#[tauri::command]
pub async fn login_by_tv_qr(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client = state.proxy_client.clone();

    let ts = crate::bili::unix_secs().to_string();

    let mut params = std::collections::BTreeMap::new();
    params.insert("appkey".to_string(), TV_APPKEY.to_string());
    params.insert("local_id".to_string(), "0".to_string());
    params.insert("ts".to_string(), ts);
    let sign = crate::bili::sign_params_sorted(&params.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect::<Vec<_>>(), crate::bili::APPSECRET);
    params.insert("sign".to_string(), sign);

    let response = client
        .post("http://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&params)
        .send()
        .await
        .map_err(|error| format!("获取 TV 二维码失败: {error}"))?;

    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|error| format!("解析 TV 二维码响应失败: {error}"))?;

    let code = json.get("code").and_then(serde_json::Value::as_i64).unwrap_or(-1);
    if code != 0 {
        return Err(json
            .get("message")
            .or_else(|| json.get("msg"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("获取 TV 二维码失败")
            .to_string());
    }

    let data = json.get("data").ok_or_else(|| "TV 二维码响应缺少 data 字段".to_string())?;
    Ok(serde_json::json!({
        "url": data.get("url").and_then(serde_json::Value::as_str).unwrap_or_default(),
        "authCode": data.get("auth_code").and_then(serde_json::Value::as_str).unwrap_or_default()
    }))
}

#[tauri::command]
pub async fn poll_tv_qr(
    app: tauri::AppHandle,
    auth_code: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client = state.proxy_client.clone();

    let ts = crate::bili::unix_secs().to_string();

    let mut params = std::collections::BTreeMap::new();
    params.insert("appkey".to_string(), TV_APPKEY.to_string());
    params.insert("auth_code".to_string(), auth_code);
    params.insert("local_id".to_string(), "0".to_string());
    params.insert("ts".to_string(), ts);
    let sign = crate::bili::sign_params_sorted(&params.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect::<Vec<_>>(), crate::bili::APPSECRET);
    params.insert("sign".to_string(), sign);

    let response = client
        .post("http://passport.bilibili.com/x/passport-tv-login/qrcode/poll")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&params)
        .send()
        .await
        .map_err(|error| format!("轮询 TV 二维码状态失败: {error}"))?;

    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|error| format!("解析 TV 二维码轮询响应失败: {error}"))?;

    let outer_code = json.get("code").and_then(serde_json::Value::as_i64).unwrap_or(-1);

    match outer_code {
        0 => {
            // 登录成功，提取 access_token
            let data = json.get("data").ok_or_else(|| "TV 登录响应缺少 data 字段".to_string())?;
            let access_token = data
                .get("access_token")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string();

            if access_token.is_empty() {
                return Err("TV 登录响应缺少 access_token".to_string());
            }

            // 同时提取 cookie 信息（如果有的话）
            if let Some(cookie_info) = data.get("cookie_info") {
                if let Some(cookies) = cookie_info.get("cookies").and_then(serde_json::Value::as_array) {
                    let cookie_str: String = cookies
                        .iter()
                        .filter_map(|c| {
                            let name = c.get("name")?.as_str()?;
                            let value = c.get("value")?.as_str()?;
                            Some(format!("{name}={value}"))
                        })
                        .collect::<Vec<_>>()
                        .join("; ");

                    if !cookie_str.is_empty() {
                        // 用 cookie 完成登录（设置凭据、持久化等）
                        let credential = complete_login_with_cookie(&app, &state, cookie_str).await?;

                        // 将 access_key 附加到凭据并持久化
                        let uid_str = credential.uid.to_string();
                        {
                            // 更新运行时 credentials map
                            let mut credentials = state.credentials.lock().unwrap();
                            if let Some(ref mut c) = credentials.get_mut(&uid_str) {
                                c.access_key = Some(access_token.clone());
                            }
                        }
                        // 同步更新主凭据（如果当前活跃账号就是新登录的账号）
                        {
                            let mut cred = state.credential.lock().await;
                            if let Some(ref mut c) = *cred {
                                c.access_key = Some(access_token.clone());
                            }
                        }
                        let _ = credential_store::save_access_key(&app, &uid_str, &access_token);

                        return Ok(serde_json::json!({
                            "status": "success",
                            "message": "TV 扫码登录成功",
                            "accessKey": access_token,
                            "credential": credential,
                        }));
                    }
                }
            }

            // TV 登录成功但无 cookie_info（不应发生）
            Err("TV 登录响应缺少 cookie_info，请重试".to_string())
        }
        86038 => Ok(serde_json::json!({
            "status": "expired",
            "message": json.get("message").and_then(serde_json::Value::as_str).unwrap_or("二维码已过期"),
        })),
        86090 => Ok(serde_json::json!({
            "status": "scanned",
            "message": json.get("message").and_then(serde_json::Value::as_str).unwrap_or("已扫码，等待确认"),
        })),
        _ => Ok(serde_json::json!({
            "status": "pending",
            "message": json.get("message").and_then(serde_json::Value::as_str).unwrap_or("等待扫码"),
        })),
    }
}


/// 应用启动时尝试恢复已保存的登录状态（所有账号）
#[tauri::command]
pub async fn restore_login(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<Credential>, String> {
    // 检查当前是否处于匿名模式（新窗口需要同步状态）
    let is_anonymous = state.active_account_id.lock().unwrap().as_deref() == Some(ANONYMOUS_ACCOUNT_ID);
    if is_anonymous {
        let cred = state.credential.lock().await.clone();
        if let Some(cred) = cred {
            return Ok(Some(Credential {
                account_id: ANONYMOUS_ACCOUNT_ID.to_string(),
                uid: 0,
                username: "匿名模式".to_string(),
                avatar: None,
                cookie: cred.cookie_header(),
                bili_jct: None,
            }));
        }
    }

    // 先检查 AppState 中是否已有凭据（setup 阶段加载的）
    let existing = state.credential.lock().await.clone();
    let setup_done = !state.credentials.lock().unwrap().is_empty();

    let parsed = if existing.is_some() && setup_done {
        existing.unwrap()
    } else {
        // AppState 中没有活跃凭据或凭据 map 为空，尝试从本地存储加载所有账号
        let cookies = credential_store::load_all_cookies(&app)?;
            if cookies.is_empty() {
                return Ok(None);
            }

            // 检查是否有活跃账号 ID
            let active_id = credential_store::load_active_account_id(&app).ok().flatten();

            // 找到要激活的账号
            let (uid_to_activate, cookie_to_load) = match active_id {
                Some(ref id) if cookies.contains_key(id) => {
                    (id.clone(), cookies.get(id).cloned())
                }
                _ => {
                    // 没有活跃账号或活跃账号丢失，取第一个
                    let (uid, cookie) = cookies.iter().next()
                        .map(|(k, v)| (k.clone(), Some(v.clone())))
                        .unwrap_or_default();
                    if uid.is_empty() {
                        return Ok(None);
                    }
                    (uid, cookie)
                }
            };

            let cookie = cookie_to_load.ok_or_else(|| "无法加载账号 Cookie".to_string())?;
            let mut cred = BiliCredential::from_cookie_str(&cookie);
            ensure_buvid(&mut cred);
            // 加载保存的 access_key
            if let Ok(Some(ak)) = credential_store::load_access_key(&app, &uid_to_activate) {
                cred.access_key = Some(ak);
            }
            if cred.validate_for_send().is_err() {
                return Ok(None);
            }

            // 设置到 credentials map
            {
                let mut credentials = state.credentials.lock().unwrap();
                credentials.insert(uid_to_activate.clone(), cred.clone());
            }
            {
                let mut credential_state = state.credential.lock().await;
                *credential_state = Some(cred.clone());
            }
            {
                let mut active_id = state.active_account_id.lock().unwrap();
                *active_id = Some(uid_to_activate.clone());
            }

            // 也加载其他非活跃账号到 credentials map
            {
                let mut credentials = state.credentials.lock().unwrap();
                for (uid, cookie_str) in &cookies {
                    if uid == &uid_to_activate {
                        continue;
                    }
                    let mut parsed = BiliCredential::from_cookie_str(cookie_str);
                    ensure_buvid(&mut parsed);
                    if parsed.validate_for_send().is_ok() {
                        credentials.insert(uid.clone(), parsed);
                    }
                }
            }

            cred
    };

    // 验证活跃账号的登录状态是否仍然有效
    // 网络请求失败时（如离线），直接返回缓存的凭据，不清除登录状态
    let api = build_api_client(Some(parsed.clone()), &state);
    let login_status = match api.verify_login_status().await {
        Ok(status) => status,
        Err(_) => {
            // 网络请求失败，返回缓存的凭据
            let mut credential = Credential::mock();
            credential.account_id = parsed.dede_user_id.clone().unwrap_or_default();
            credential.uid = parsed
                .dede_user_id
                .as_deref()
                .and_then(|value| value.parse::<u64>().ok())
                .unwrap_or(0);
            credential.cookie = parsed.cookie_header();
            credential.bili_jct = parsed.bili_jct.clone();
            return Ok(Some(credential));
        }
    };

    if !login_status.is_logged_in {
        // 只清除活跃状态，不删除 cookie —— 可能是网络问题导致验证失败
        // 保留凭据让用户下次可以重试或手动切换
        {
            let mut credential_state = state.credential.lock().await;
            *credential_state = None;
        }
        {
            let mut active_id = state.active_account_id.lock().unwrap();
            *active_id = None;
        }
        if let Err(e) = credential_store::clear_active_account_id(&app) { warn!("清除活跃账号 ID 持久化失败: {e}"); }
        let _ = tray::refresh_tray(&app);
        return Ok(None);
    }

    let mut credential = Credential::mock();
    if let Some(account) = login_status.account {
        credential.account_id = account.id;
        credential.uid = account.uid;
        credential.username = account.username;
        credential.avatar = account.avatar;
    } else {
        credential.uid = parsed
            .dede_user_id
            .as_deref()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(credential.uid);
    }
    credential.cookie = parsed.cookie_header();
    credential.bili_jct = parsed.bili_jct.clone();
    Ok(Some(credential))
}

/// 停止自动发送 + 断开 WS + 清除活跃凭据（内部辅助函数）
async fn deactivate_current(state: &AppState) {
    // 停止自动发送
    {
        let mut auto_sender = state.auto_sender.lock().await;
        if let Some(shutdown_tx) = auto_sender.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }
    }

    // 断开 WebSocket
    {
        let mut ws_client = state.ws_client.lock().await;
        if let Some(client) = ws_client.as_mut() {
            client.disconnect().await;
        }
    }

    // 清除活跃凭据
    {
        let mut credential_state = state.credential.lock().await;
        *credential_state = None;
    }
    {
        let mut active = state.active_account_id.lock().unwrap();
        *active = None;
    }

    // 清除发送凭证
    {
        let mut sending = state.sending_credential.lock().await;
        *sending = None;
    }
}

/// 移除指定账号，返回新的活跃账号 ID（如果自动激活了另一个账号）
#[tauri::command]
pub async fn remove_account(
    app: tauri::AppHandle,
    account_id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let is_active = {
        let active_id = state.active_account_id.lock().unwrap();
        active_id.as_deref() == Some(&account_id)
    };

    if is_active {
        deactivate_current(&state).await;
    }

    if let Err(e) = credential_store::remove_cookie(&app, &account_id) { warn!("移除账号 Cookie 持久化失败: {e}"); }
    if let Err(e) = credential_store::remove_account_meta(&app, &account_id) { warn!("移除账号元数据持久化失败: {e}"); }
    state.credentials.lock().unwrap().remove(&account_id);
    state.account_metas.lock().unwrap().remove(&account_id);

    if is_active {
        if let Err(e) = credential_store::clear_active_account_id(&app) { warn!("清除活跃账号 ID 持久化失败: {e}"); }

        // 如果还有其他账号，自动激活第一个
        let next = {
            let credentials = state.credentials.lock().unwrap();
            credentials.iter().next().map(|(uid, cred)| (uid.clone(), cred.clone()))
        };
        if let Some((next_uid, next_cred)) = next {
            {
                let mut credential_state = state.credential.lock().await;
                *credential_state = Some(next_cred);
            }
            {
                let mut active = state.active_account_id.lock().unwrap();
                *active = Some(next_uid.clone());
            }
            credential_store::save_active_account_id(&app, &next_uid)?;
            let _ = tray::refresh_tray(&app);
            Ok(Some(next_uid))
        } else {
            let _ = tray::refresh_tray(&app);
            Ok(None)
        }
    } else {
        let _ = tray::refresh_tray(&app);
        Ok(None)
    }
}

/// 切换活跃账号
#[tauri::command]
pub async fn switch_account(
    app: tauri::AppHandle,
    account_id: String,
    state: State<'_, AppState>,
) -> Result<Credential, String> {
    // 获取目标账号凭据
    let cred = {
        let credentials = state.credentials.lock().unwrap();
        credentials
            .get(&account_id)
            .cloned()
            .ok_or_else(|| format!("账号 {account_id} 未找到"))?
    };

    // 停止自动发送（避免使用旧账号凭据）
    {
        let mut auto_sender = state.auto_sender.lock().await;
        if let Some(shutdown_tx) = auto_sender.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }
    }

    // 断开 WebSocket（避免使用旧账号凭据）
    {
        let mut ws_client = state.ws_client.lock().await;
        if let Some(client) = ws_client.as_mut() {
            client.disconnect().await;
        }
    }

    // 验证新账号登录状态
    let api = build_api_client(Some(cred.clone()), &state);
    let login_status = api.verify_login_status().await?;

    if !login_status.is_logged_in {
        return Err("该账号登录已过期，请重新登录".to_string());
    }

    // 设置为活跃账号
    {
        let mut credential_state = state.credential.lock().await;
        *credential_state = Some(cred.clone());
    }
    {
        let mut active = state.active_account_id.lock().unwrap();
        *active = Some(account_id.clone());
    }

    // 清理匿名凭据（如果存在）
    {
        let mut credentials = state.credentials.lock().unwrap();
        credentials.remove(ANONYMOUS_ACCOUNT_ID);
    }

    // 清除发送凭证（下次打开弹幕窗口时会 fallback 到新的主凭证）
    {
        let mut sending = state.sending_credential.lock().await;
        *sending = None;
    }

    // 持久化活跃账号
    credential_store::save_active_account_id(&app, &account_id)?;

    // 更新账号元数据（切换后可能需要刷新用户名）
    {
        let meta = credential_store::AccountMeta {
            username: if let Some(ref account) = login_status.account {
                account.username.clone()
            } else {
                format!("账号 {}", cred.dede_user_id.as_deref().unwrap_or(&account_id))
            },
            avatar: login_status.account.as_ref().and_then(|a| a.avatar.clone()),
        };
        credential_store::save_account_meta(&app, &account_id, &meta)?;
        let mut account_metas = state.account_metas.lock().unwrap();
        account_metas.insert(account_id.clone(), meta);
    }

    let _ = tray::refresh_tray(&app);

    // 构建返回的 Credential
    let mut credential = Credential::mock();
    if let Some(account) = login_status.account {
        credential.account_id = account.id;
        credential.uid = account.uid;
        credential.username = account.username;
        credential.avatar = account.avatar;
    } else {
        credential.uid = cred
            .dede_user_id
            .as_deref()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0);
    }
    credential.cookie = cred.cookie_header();
    credential.bili_jct = cred.bili_jct.clone();
    Ok(credential)
}

/// 获取所有已登录的账号列表
#[tauri::command]
pub async fn list_accounts(state: State<'_, AppState>) -> Result<Vec<Credential>, String> {
    let credentials = state.credentials.lock().unwrap();
    let metas = state.account_metas.lock().unwrap();

    let mut accounts = Vec::new();
    for (uid, cred) in credentials.iter() {
        let uid_num = cred
            .dede_user_id
            .as_deref()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0);

        let meta = metas.get(uid);

        accounts.push(Credential {
            account_id: uid.clone(),
            uid: uid_num,
            username: meta.map(|m| m.username.clone()).unwrap_or_else(|| format!("账号 {uid_num}")),
            avatar: meta.and_then(|m| m.avatar.clone()),
            cookie: cred.cookie_header(),
            bili_jct: cred.bili_jct.clone(),
        });
    }

    Ok(accounts)
}

/// 切换发送弹幕使用的账号（不断开 WS / 音频流）
#[tauri::command]
pub async fn switch_sending_account(
    account_id: String,
    state: State<'_, AppState>,
) -> Result<Credential, String> {
    // 查找目标账号凭据
    let cred = {
        let credentials = state.credentials.lock().unwrap();
        credentials
            .get(&account_id)
            .cloned()
            .ok_or_else(|| format!("账号 {account_id} 未找到"))?
    };

    // 验证登录状态
    let api = build_api_client(Some(cred.clone()), &state);
    let login_status = api.verify_login_status().await?;

    if !login_status.is_logged_in {
        return Err("该账号登录已过期，请重新登录".to_string());
    }

    // 设置发送凭据
    {
        let mut sending = state.sending_credential.lock().await;
        *sending = Some(cred.clone());
    }

    log::info!("已切换发送账号为: {account_id}");

    // 构建返回的 Credential
    let mut credential = Credential::mock();
    if let Some(account) = login_status.account {
        credential.account_id = account.id;
        credential.uid = account.uid;
        credential.username = account.username;
        credential.avatar = account.avatar;
    } else {
        credential.uid = cred
            .dede_user_id
            .as_deref()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0);
    }
    credential.cookie = cred.cookie_header();
    credential.bili_jct = cred.bili_jct.clone();
    Ok(credential)
}

/// 获取当前发送账号 ID（未设置时返回 None）
#[tauri::command]
pub async fn get_sending_account_id(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let sending = state.sending_credential.lock().await;
    Ok(sending.as_ref().and_then(|c| c.dede_user_id.clone()))
}

/// 切换到匿名模式（仅包含 buvid3，可获取弹幕流和音频流）
#[tauri::command]
pub async fn switch_to_anonymous(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Credential, String> {
    // 停止自动发送
    {
        let mut auto_sender = state.auto_sender.lock().await;
        if let Some(shutdown_tx) = auto_sender.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }
    }

    // 断开 WebSocket
    {
        let mut ws_client = state.ws_client.lock().await;
        if let Some(client) = ws_client.as_mut() {
            client.disconnect().await;
        }
    }

    // 创建匿名凭据
    let anon_cred = BiliCredential::anonymous();
    let cookie_header = anon_cred.cookie_header();

    // 设置为活跃凭据
    {
        let mut credential_state = state.credential.lock().await;
        *credential_state = Some(anon_cred.clone());
    }
    {
        let mut active = state.active_account_id.lock().unwrap();
        *active = Some(ANONYMOUS_ACCOUNT_ID.to_string());
    }

    // 添加到 credentials map（转移所有权，避免额外克隆）
    {
        let mut credentials = state.credentials.lock().unwrap();
        credentials.insert(ANONYMOUS_ACCOUNT_ID.to_string(), anon_cred);
    }

    // 清除发送凭证
    {
        let mut sending = state.sending_credential.lock().await;
        *sending = None;
    }

    // 注意：匿名模式不持久化 active_account_id，重启后自动恢复到之前的登录账号

    let _ = tray::refresh_tray(&app);

    log::info!("已切换到匿名模式");

    let credential = Credential {
        account_id: ANONYMOUS_ACCOUNT_ID.to_string(),
        uid: 0,
        username: "匿名模式".to_string(),
        avatar: None,
        cookie: cookie_header,
        bili_jct: None,
    };

    // 发送跨窗口事件，通知其他窗口更新状态
    let _ = app.emit("account-switched", serde_json::json!({
        "accountId": ANONYMOUS_ACCOUNT_ID,
        "credential": credential,
    }));

    Ok(credential)
}
