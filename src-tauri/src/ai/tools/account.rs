//! 账号工具：只读查询 + 切换 + 删除。
//!
//! 凭据（cookie / bili_jct）一律不出现在返回里——它们是密钥，不该进模型上下文。
//!
//! 写操作直接调用命令层的同名函数（`#[tauri::command]` 函数本身仍可当普通 async fn 调），
//! 因此事件发射、托盘刷新、发送凭据联动全部与前端走同一条路径。

use super::{active_account_id, api_with_main, args};
use crate::ai::spec::ToolError;
use crate::AppState;
use tauri::Manager;

/// 列出所有已登录账号。
pub async fn list(
    _app: &tauri::AppHandle,
    state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let credentials = state
        .credentials
        .lock()
        .map_err(|_| ToolError::failed("读取账号列表失败（锁中毒）"))?;
    let metas = state
        .account_metas
        .lock()
        .map_err(|_| ToolError::failed("读取账号元数据失败（锁中毒）"))?;
    let active = active_account_id(state);

    let accounts: Vec<serde_json::Value> = credentials
        .iter()
        .map(|(uid, credential)| {
            let meta = metas.get(uid);
            serde_json::json!({
                "accountId": uid,
                "uid": credential
                    .dede_user_id
                    .as_deref()
                    .and_then(|value| value.parse::<u64>().ok())
                    .unwrap_or(0),
                "username": meta
                    .map(|meta| meta.username.clone())
                    .unwrap_or_else(|| format!("账号 {uid}")),
                "avatar": meta.and_then(|meta| meta.avatar.clone()),
                "expiresAt": meta.and_then(|meta| meta.expires_at),
                "active": active.as_deref() == Some(uid.as_str()),
            })
        })
        .collect();

    Ok(serde_json::json!({
        "count": accounts.len(),
        "activeAccountId": active,
        "accounts": accounts,
    }))
}

/// 当前登录态：是否登录、哪个账号、能否发送。
pub async fn get_current(
    _app: &tauri::AppHandle,
    state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let credential = state.credential.lock().await.clone();
    let sending = state.sending_credential.lock().await.clone();
    let active = active_account_id(state);

    let Some(credential) = credential else {
        return Ok(serde_json::json!({
            "loggedIn": false,
            "activeAccountId": null,
            "canSend": false,
            "hint": "未登录：写操作需要先登录。让用户在账号页扫码，或调用 account_list 查看已有账号",
        }));
    };

    let can_send = credential.validate_for_send().is_ok();
    let meta = state
        .account_metas
        .lock()
        .ok()
        .and_then(|metas| active.as_ref().and_then(|id| metas.get(id)).cloned());

    Ok(serde_json::json!({
        "loggedIn": true,
        "activeAccountId": active,
        "uid": credential
            .dede_user_id
            .as_deref()
            .and_then(|value| value.parse::<u64>().ok()),
        "username": meta.as_ref().map(|meta| meta.username.clone()),
        "avatar": meta.as_ref().and_then(|meta| meta.avatar.clone()),
        "expiresAt": meta.as_ref().and_then(|meta| meta.expires_at),
        "canSend": can_send,
        "sendingAccountSeparate": sending.is_some(),
        "hint": if can_send {
            serde_json::Value::Null
        } else {
            serde_json::json!("当前凭据无法发送（可能已过期），提示用户重新登录")
        },
    }))
}

/// 瓜子余额（金/银）。礼物功能未编译时返回明确的能力缺失。
pub async fn get_wallet(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let room_id = args::opt_u64(raw, "roomId")
        .or_else(|| super::current_room_id(state))
        .ok_or_else(ToolError::not_in_room)?;

    if !cfg!(feature = "gift-send") {
        return Err(ToolError::new(
            "FEATURE_DISABLED",
            "本构建未启用礼物打赏功能（官方发布默认关闭，涉及真实扣费）",
        )
        .with_hint("这是编译期开关，运行时无法打开；不要重试送礼相关工具"));
    }

    let api = api_with_main(state).await;
    let wallet = api
        .get_gift_wallet(room_id)
        .await
        .map_err(super::classify_business_error)?;

    Ok(serde_json::json!({
        "roomId": room_id,
        "gold": wallet.gold,
        "silver": wallet.silver,
        "goldYuan": (wallet.gold as f64) / 1000.0,
    }))
}

/// 切换当前账号。返回新的活跃账号 id。
pub async fn switch(
    app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let account_id = args::string(raw, "accountId")?;

    let exists = state
        .credentials
        .lock()
        .map(|map| map.contains_key(&account_id))
        .unwrap_or(false);
    if !exists {
        return Err(ToolError::invalid_args(format!(
            "账号 {account_id} 不存在或凭据已失效"
        ))
        .with_hint("调用 account_list 获取可用的 accountId"));
    }

    crate::commands::auth::switch_account(app.clone(), account_id.clone(), app.state::<AppState>())
        .await
        .map_err(super::classify_business_error)?;

    Ok(serde_json::json!({
        "switched": true,
        "accountId": account_id,
    }))
}

/// 删除账号凭据。
pub async fn remove(
    app: &tauri::AppHandle,
    _state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let account_id = args::string(raw, "accountId")?;
    crate::commands::auth::remove_account(app.clone(), account_id.clone(), app.state::<AppState>())
        .await
        .map_err(super::classify_business_error)?;
    Ok(serde_json::json!({ "removed": true, "accountId": account_id }))
}
