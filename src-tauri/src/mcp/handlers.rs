//! MCP 方法实现：initialize / tools/list / tools/call / ping。
//!
//! 只做协议适配，所有业务与权限判断都在 [`crate::ai::dispatch`]。

use crate::ai::registry;
use crate::mcp::jsonrpc::{IncomingMessage, OutgoingResponse};
use crate::mcp::server;

const SERVER_NAME: &str = "bilidanmu";
const DEFAULT_VERSION: &str = "2025-06-18";

/// 处理一条 JSON-RPC 消息。返回 None 表示这是通知、无需响应体。
pub async fn handle_message(
    app: &tauri::AppHandle,
    text: &str,
) -> Option<serde_json::Value> {
    let message: IncomingMessage = match serde_json::from_str(text) {
        Ok(message) => message,
        Err(error) => {
            let response = OutgoingResponse::error(
                None,
                crate::mcp::jsonrpc::PARSE_ERROR,
                format!("无法解析 JSON-RPC 消息: {error}"),
            );
            return Some(serde_json::to_value(response).ok()?);
        }
    };

    let is_notification = message.id.is_none();
    let id = message.id.clone();

    let response = match message.method.as_str() {
        "initialize" => OutgoingResponse::ok(
            id,
            serde_json::json!({
                "protocolVersion": negotiate_version(&message.params),
                "capabilities": {
                    "tools": { "listChanged": false }
                },
                "serverInfo": {
                    "name": SERVER_NAME,
                    "title": "BiliDanmu 直播助手",
                    "version": env!("CARGO_PKG_VERSION"),
                },
                "instructions": "BiliDanmu 是一个 B 站直播间弹幕客户端。\
能力折叠成 9 个域工具：app / live / memory / room / danmaku / gift / video / account / settings，\
统一用 { action, params } 调用；参数不确定时先调 mcp_describe(domain, action) 查完整 schema。\
开始任务前先 app{action:status} 了解登录态与当前房间；理解直播间用 live{action:get_context}；\
写操作会被应用的权限模式约束，可能需要用户确认。",
            }),
        ),
        // 客户端在 initialize 之后会发这条通知，无需响应
        "notifications/initialized" => {
            return if is_notification { None } else {
                Some(serde_json::to_value(OutgoingResponse::ok(id, serde_json::json!({}))).ok()?)
            };
        }
        "ping" => OutgoingResponse::ok(id, serde_json::json!({})),
        "tools/list" => {
            // 只返回 9 个域 + mcp_describe：完整 action 参数按需通过 mcp_describe 取，
            // 避免每次会话把所有内部工具的 schema 全塞进上下文。
            let tools = registry::exposed_tools();
            OutgoingResponse::ok(id, serde_json::json!({ "tools": tools }))
        }
        "tools/call" => handle_tools_call(app, id, message.params).await,
        other => OutgoingResponse::error(
            id,
            crate::mcp::jsonrpc::METHOD_NOT_FOUND,
            format!("不支持的方法：{other}"),
        ),
    };

    if is_notification {
        return None;
    }
    serde_json::to_value(response).ok()
}

async fn handle_tools_call(
    app: &tauri::AppHandle,
    id: Option<serde_json::Value>,
    params: Option<serde_json::Value>,
) -> OutgoingResponse {
    let Some(params) = params else {
        return OutgoingResponse::error(
            id,
            crate::mcp::jsonrpc::INVALID_PARAMS,
            "tools/call 需要 params.name",
        );
    };

    let Some(name) = params.get("name").and_then(|value| value.as_str()) else {
        return OutgoingResponse::error(
            id,
            crate::mcp::jsonrpc::INVALID_PARAMS,
            "params.name 缺失",
        );
    };

    let args = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));

    let result = server::call_tool_for_mcp(app, name, args).await;

    // 业务失败也走 isError 而不是 JSON-RPC 错误：模型需要看到结构化错误码与提示
    let payload = serde_json::json!({
        "content": [ { "type": "text", "text": result.to_text() } ],
        "structuredContent": result,
        "isError": !result.ok,
    });

    OutgoingResponse::ok(id, payload)
}

/// 版本协商：客户端给的版本受支持就用它，否则回落到最新的默认版本。
fn negotiate_version(params: &Option<serde_json::Value>) -> &'static str {
    let requested = params
        .as_ref()
        .and_then(|params| params.get("protocolVersion"))
        .and_then(|value| value.as_str());

    if let Some(requested) = requested {
        if let Some(supported) = server::supported_versions()
            .iter()
            .find(|version| **version == requested)
        {
            return supported;
        }
    }
    DEFAULT_VERSION
}
