//! 设置工具：读取全量设置、按白名单局部修改。
//!
//! `settings_patch` 刻意只支持**白名单字段**：整包写 `Settings` 会撞上已知的
//! 嵌套合并陷阱（前端 `mergeSettings` 只深合并一级，缺字段会让旧库用户的设置页崩溃），
//! 也可能让模型误改窗口几何、快捷键这类它不该碰的东西。

use super::args;
use crate::ai::spec::ToolError;
use crate::ai::tools::classify_business_error;
use crate::AppState;
use tauri::Manager;

/// 允许 AI 修改的顶层字段白名单。
///
/// 只收"影响行为、不破坏 UI"的字段：发弹幕节奏、风险控制、接收策略、过滤词。
/// 外观、快捷键、窗口几何、STT 模型路径一律不给。
const PATCHABLE: &[&str] = &[
    "sendInterval",
    "rateLimit",
    "riskControl",
    "receive",
    "filter",
];

/// 读取设置。默认剔除快捷键、窗口几何等与 AI 无关的大块配置。
pub async fn load(state: &AppState) -> Result<serde_json::Value, ToolError> {
    let settings = crate::settings_store::load_settings(state).map_err(classify_business_error)?;
    let mut value = serde_json::to_value(settings)
        .map_err(|error| ToolError::failed(format!("序列化设置失败: {error}")))?;

    // 快捷键绑定与窗口外观对模型没有决策价值，只会吃 token
    if let Some(map) = value.as_object_mut() {
        map.remove("shortcuts");
        map.remove("appearance");
    }

    // 附上能力查询：模型常要判断"这个功能在这个构建里有没有"
    map_insert(&mut value, "giftSendEnabled", serde_json::json!(cfg!(feature = "gift-send")));
    map_insert(&mut value, "mockMode", serde_json::json!(crate::bili::mock::is_enabled()));

    Ok(value)
}

/// 局部修改设置：白名单字段内的按对象深合并，其余忽略并明确告知。
pub async fn patch(
    app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let patch = raw
        .get("patch")
        .cloned()
        .unwrap_or_else(|| raw.clone());
    let Some(patch_map) = patch.as_object() else {
        return Err(ToolError::invalid_args("patch 必须是对象"));
    };

    if patch_map.is_empty() {
        return Err(ToolError::invalid_args("patch 不能为空对象"));
    }

    let mut settings =
        crate::settings_store::load_settings(state).map_err(classify_business_error)?;
    let mut applied: Vec<String> = Vec::new();
    let mut ignored: Vec<String> = Vec::new();

    let mut current = serde_json::to_value(&settings)
        .map_err(|error| ToolError::failed(format!("序列化设置失败: {error}")))?;

    for (key, value) in patch_map {
        if !PATCHABLE.contains(&key.as_str()) {
            ignored.push(key.clone());
            continue;
        }
        let Some(current_map) = current.as_object_mut() else {
            break;
        };
        match current_map.get_mut(key) {
            Some(existing) if existing.is_object() && value.is_object() => {
                // 一级字段内的子字段合并：只覆盖显式给出的键
                if let (Some(target), Some(incoming)) = (existing.as_object_mut(), value.as_object()) {
                    for (sub_key, sub_value) in incoming {
                        target.insert(sub_key.clone(), sub_value.clone());
                    }
                }
                applied.push(key.clone());
            }
            Some(existing) => {
                *existing = value.clone();
                applied.push(key.clone());
            }
            None => ignored.push(key.clone()),
        }
    }

    if applied.is_empty() {
        return Err(ToolError::invalid_args(format!(
            "patch 里没有任何可修改的字段；可修改的是 {PATCHABLE:?}"
        ))
        .with_hint("先调用 settings_get 查看当前结构，再逐字段修改"));
    }

    settings =
        serde_json::from_value(current).map_err(|error| {
            ToolError::invalid_args(format!("修改后的设置结构不合法: {error}"))
        })?;

    // 走命令层，保证 STT 重启、快捷键重注册、吸附几何刷新等副作用都发生
    crate::commands::settings::update_settings(app.clone(), app.state::<AppState>(), settings)
        .await
        .map_err(classify_business_error)?;

    Ok(serde_json::json!({
        "applied": applied,
        "ignored": ignored,
        "note": if ignored.is_empty() {
            serde_json::Value::Null
        } else {
            serde_json::json!("ignored 中的字段不在 AI 可改白名单内，未生效")
        },
    }))
}

/// 只取某几个字段，避免模型为了一个值拿到整份设置。
pub async fn get_keys(
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let keys: Vec<String> = raw
        .get("keys")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(|text| text.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let full = load(state).await?;
    if keys.is_empty() {
        return Ok(full);
    }

    let map = full.as_object().cloned().unwrap_or_default();
    let mut picked = serde_json::Map::new();
    let mut missing: Vec<String> = Vec::new();
    for key in keys {
        match map.get(&key) {
            Some(value) => {
                picked.insert(key, value.clone());
            }
            None => missing.push(key),
        }
    }

    Ok(serde_json::json!({
        "values": picked,
        "missing": missing,
    }))
}

/// 当前权限模式与可用模式说明。
pub async fn get_permission(state: &AppState) -> Result<serde_json::Value, ToolError> {
    use crate::ai::policy::PermissionMode;
    let mode = crate::ai::policy::load_mode(state);
    Ok(serde_json::json!({
        "mode": mode.as_str(),
        "label": mode.label(),
        "modes": [
            { "value": PermissionMode::ConfirmAll.as_str(), "label": PermissionMode::ConfirmAll.label(),
              "description": "执行任何非只读操作前都询问用户" },
            { "value": PermissionMode::Autonomous.as_str(), "label": PermissionMode::Autonomous.label(),
              "description": "只读与普通写直通；花钱（送礼/发弹幕/发评论）与不可逆操作需确认" },
            { "value": PermissionMode::Full.as_str(), "label": PermissionMode::Full.label(),
              "description": "全部自动执行，不弹确认" },
        ],
    }))
}

fn map_insert(value: &mut serde_json::Value, key: &str, item: serde_json::Value) {
    if let Some(map) = value.as_object_mut() {
        map.insert(key.to_string(), item);
    }
}

/// 未使用但保留：显式读取单个布尔设置，给未来工具复用
#[allow(dead_code)]
pub fn read_bool(state: &AppState, key: &str) -> Option<bool> {
    let settings = crate::settings_store::load_settings(state).ok()?;
    let value = serde_json::to_value(settings).ok()?;
    let _ = &args::opt_bool;
    value.get(key).and_then(|item| item.as_bool())
}
