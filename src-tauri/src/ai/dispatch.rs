//! 工具调度：唯一的调用入口。
//!
//! 职责顺序（顺序本身是契约）：
//! 1. 查规格 → 未知工具立即失败
//! 2. 读权限模式 → 判断是否需要用户确认
//! 3. 需要确认则登记 + emit 事件 + 等待，拒绝则返回 `USER_DENIED`
//! 4. 交给 [`crate::ai::registry::dispatch_tool`] 执行
//! 5. 写审计（无论成败）
//!
//! MCP server 与前端调试面板都只调 [`call_tool`]，因此权限与审计不可能被绕过。

use crate::ai::spec::{Origin, ToolError, ToolResult};
use crate::AppState;
use std::time::Instant;
use tauri::{Emitter, Manager};

/// 等待用户确认的时限。MCP 客户端普遍 60s 超时，留 5s 余量。
const CONFIRM_TIMEOUT_SECS: u64 = 55;

/// 调用一个工具。这是工具层的公开入口。
pub async fn call_tool(
    app: &tauri::AppHandle,
    state: &AppState,
    name: &str,
    args: serde_json::Value,
    origin: Origin,
) -> ToolResult {
    let started = Instant::now();

    let Some(spec) = crate::ai::registry::find_spec(name) else {
        let error = ToolError::unknown_tool(name);
        crate::ai::audit::record(
            state,
            name,
            origin.as_str(),
            &args,
            false,
            &error.to_string(),
            started.elapsed().as_millis() as u64,
        );
        return ToolResult::fail(error);
    };

    let mode = crate::ai::policy::load_mode(state);
    if spec.risk.needs_confirmation(mode) {
        match request_confirmation(app, state, &spec, &args).await {
            Ok(true) => {}
            Ok(false) => {
                let error = ToolError::user_denied();
                crate::ai::audit::record(
                    state,
                    name,
                    origin.as_str(),
                    &args,
                    false,
                    "用户拒绝",
                    started.elapsed().as_millis() as u64,
                );
                return ToolResult::fail(error);
            }
            Err(error) => {
                crate::ai::audit::record(
                    state,
                    name,
                    origin.as_str(),
                    &args,
                    false,
                    &error.to_string(),
                    started.elapsed().as_millis() as u64,
                );
                return ToolResult::fail(error);
            }
        }
    }

    let outcome = crate::ai::registry::dispatch_tool(app, state, name, &args).await;
    let duration = started.elapsed().as_millis() as u64;

    match outcome {
        Ok(data) => {
            let summary = summarize(&data);
            crate::ai::audit::record(state, name, origin.as_str(), &args, true, &summary, duration);
            ToolResult::ok(data)
        }
        Err(error) => {
            crate::ai::audit::record(
                state,
                name,
                origin.as_str(),
                &args,
                false,
                &error.to_string(),
                duration,
            );
            ToolResult::fail(error)
        }
    }
}

/// 请用户确认一次操作。返回 Ok(true)=同意、Ok(false)=拒绝、Err=超时或通道不可用。
async fn request_confirmation(
    app: &tauri::AppHandle,
    state: &AppState,
    spec: &crate::ai::spec::ToolSpec,
    args: &serde_json::Value,
) -> Result<bool, ToolError> {
    let id = crate::ai::confirm::new_confirmation_id();
    let message = describe_call(spec.name, spec.title, args);

    let (receiver, main_was_visible) = {
        let mut registry = state
            .ai_pending_confirm
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let receiver = registry.register(id.clone());
        (receiver, main_window_visible(app))
    };

    let payload = crate::ai::confirm::PendingConfirmation {
        id: id.clone(),
        tool: spec.name.to_string(),
        title: format!("AI 请求：{}", spec.title),
        message,
        risk: spec.risk.as_str().to_string(),
    };
    let _ = app.emit("ai-confirm-request", &payload);

    // 用户可能正停留在弹幕窗口，主窗口被隐藏——临时叫出来
    if main_was_visible == Some(false) {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
        }
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }

    let wait = tokio::time::timeout(
        std::time::Duration::from_secs(CONFIRM_TIMEOUT_SECS),
        receiver,
    )
    .await;

    // 恢复主窗口原本的可见性：用户只是来点个确认，不该因此改变窗口姿态
    if main_was_visible == Some(false) {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.hide();
        }
    }

    match wait {
        Ok(Ok(approved)) => Ok(approved),
        Ok(Err(_)) => {
            // sender 被丢弃：通常意味着同一 id 被重复登记覆盖
            Err(ToolError::confirmation_timeout(id))
        }
        Err(_) => {
            let mut registry = state
                .ai_pending_confirm
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            registry.discard(&id);
            Err(ToolError::confirmation_timeout(id))
        }
    }
}

fn main_window_visible(app: &tauri::AppHandle) -> Option<bool> {
    app.get_webview_window("main")
        .and_then(|window| window.is_visible().ok())
}

/// 给用户看的确认文案：说清"要做什么"，而不是把 JSON 甩出来。
fn describe_call(name: &str, title: &str, args: &serde_json::Value) -> String {
    let mut parts: Vec<String> = Vec::new();

    match name {
        "danmaku_send" => {
            if let Some(message) = args.get("message").and_then(|value| value.as_str()) {
                parts.push(format!("发送弹幕：{message}"));
            }
        }
        "danmaku_send_emoticon" => {
            if let Some(unique) = args.get("emoticonUnique").and_then(|value| value.as_str()) {
                parts.push(format!("发送表情弹幕：{unique}"));
            }
        }
        "gift_send" => {
            let gift_id = args.get("giftId").and_then(|value| value.as_u64()).unwrap_or(0);
            let count = args.get("giftNum").and_then(|value| value.as_u64()).unwrap_or(1);
            let price = args.get("price").and_then(|value| value.as_u64()).unwrap_or(0);
            let coin = args
                .get("coinType")
                .and_then(|value| value.as_str())
                .unwrap_or("silver");
            let total = price.saturating_mul(count);
            if coin == "gold" && total > 0 {
                parts.push(format!(
                    "赠送礼物 #{gift_id} × {count}，合计 {:.2} 元（真实扣费）",
                    total as f64 / 1000.0
                ));
            } else {
                parts.push(format!("赠送礼物 #{gift_id} × {count}（{coin}）"));
            }
        }
        "video_comment_post" => {
            if let Some(message) = args.get("message").and_then(|value| value.as_str()) {
                parts.push(format!("发表公开评论：{message}"));
            }
        }
        "account_remove" => {
            if let Some(account) = args.get("accountId").and_then(|value| value.as_str()) {
                parts.push(format!("删除账号 {account} 的本地凭据（不可恢复，需重新扫码）"));
            }
        }
        _ => {
            parts.push(title.to_string());
        }
    }

    let mut text = parts.join("\n");
    if text.is_empty() {
        text = title.to_string();
    }
    text.push_str("\n\n允许这次操作吗？");
    text
}

/// 审计里存的结果摘要：不存整个 data（可能很大），只留关键信息。
fn summarize(data: &serde_json::Value) -> String {
    if let Some(count) = data.get("count").and_then(|value| value.as_u64()) {
        return format!("成功，返回 {count} 条");
    }
    if let Some(sent) = data.get("sent").and_then(|value| value.as_bool()) {
        return if sent { "成功".to_string() } else { "已提交但返回失败".to_string() };
    }
    let text = data.to_string();
    if text.chars().count() > 200 {
        format!("成功，返回 {} 字符", text.chars().count())
    } else {
        format!("成功：{text}")
    }
}
