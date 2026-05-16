use crate::models::account::{Credential, LoginStatus};
use crate::bili::buvid::ensure_buvid;
use crate::bili::credential::BiliCredential;
use crate::commands::build_api_client;
use crate::tray;
use crate::{credential_store, AppState};
use tauri::State;

#[tauri::command]
pub async fn login_by_qr() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .build()
        .map_err(|error| format!("创建 HTTP 客户端失败: {error}"))?;

    let response = client
        .get("https://passport.bilibili.com/x/passport-login/web/qrcode/generate")
        .header("Referer", "https://www.bilibili.com/")
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
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .build()
        .map_err(|error| format!("创建 HTTP 客户端失败: {error}"))?;

    let response = client
        .get("https://passport.bilibili.com/x/passport-login/web/qrcode/poll")
        .header("Referer", "https://www.bilibili.com/")
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
    let api = build_api_client(Some(parsed.clone()), &state)?;
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

    // 保存到所有账号 map
    {
        let mut credentials = state.credentials.lock().unwrap();
        credentials.insert(uid.clone(), parsed.clone());
    }

    // 设置为当前活跃账号
    {
        let mut credential_state = state.credential.lock().await;
        *credential_state = Some(parsed.clone());
    }
    {
        let mut active_id = state.active_account_id.lock().unwrap();
        *active_id = Some(uid.clone());
    }

    // 持久化保存 cookie、活跃账号和账号元数据
    credential_store::save_cookie(&app, &uid, &cookie)?;
    credential_store::save_active_account_id(&app, &uid)?;

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
        let _ = credential_store::save_account_meta(&app, &uid, &meta);
        let mut account_metas = state.account_metas.lock().unwrap();
        account_metas.insert(uid.clone(), meta);
    }

    // 清理旧版迁移残留的 "legacy" key
    {
        let mut cookies = credential_store::load_all_cookies(&app).unwrap_or_default();
        if cookies.remove("legacy").is_some() {
            let _ = credential_store::save_all_cookies(&app, &cookies);
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

#[tauri::command]
pub async fn check_login_status(state: State<'_, AppState>) -> Result<LoginStatus, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state)?;
    api.verify_login_status().await
}

/// 应用启动时尝试恢复已保存的登录状态（所有账号）
#[tauri::command]
pub async fn restore_login(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<Credential>, String> {
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
    let api = build_api_client(Some(parsed.clone()), &state)?;
    let login_status = api.verify_login_status().await?;

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
        let _ = credential_store::clear_active_account_id(&app);
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
}

/// 退出登录（移除当前活跃账号）
#[tauri::command]
pub async fn logout(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let active_id = state.active_account_id.lock().unwrap().clone();

    deactivate_current(&state).await;

    if let Some(uid) = active_id {
        let _ = credential_store::remove_cookie(&app, &uid);
        let _ = credential_store::remove_account_meta(&app, &uid);
        state.credentials.lock().unwrap().remove(&uid);
        state.account_metas.lock().unwrap().remove(&uid);
    }

    let _ = credential_store::clear_active_account_id(&app);
    let _ = tray::refresh_tray(&app);
    Ok(())
}

/// 移除指定账号
#[tauri::command]
pub async fn remove_account(
    app: tauri::AppHandle,
    account_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let is_active = {
        let active_id = state.active_account_id.lock().unwrap();
        active_id.as_deref() == Some(&account_id)
    };

    if is_active {
        deactivate_current(&state).await;
    }

    let _ = credential_store::remove_cookie(&app, &account_id);
    let _ = credential_store::remove_account_meta(&app, &account_id);
    state.credentials.lock().unwrap().remove(&account_id);
    state.account_metas.lock().unwrap().remove(&account_id);

    if is_active {
        let _ = credential_store::clear_active_account_id(&app);

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
            let _ = credential_store::save_active_account_id(&app, &next_uid);
        }
    }

    let _ = tray::refresh_tray(&app);
    Ok(())
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
    let api = build_api_client(Some(cred.clone()), &state)?;
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
        let _ = credential_store::save_account_meta(&app, &account_id, &meta);
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
