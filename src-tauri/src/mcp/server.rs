//! MCP server：在 127.0.0.1 上监听，把 HTTP POST 的 JSON-RPC 转给工具层。
//!
//! 传输实现照搬 `proxy/stream_proxy.rs` 的 hyper 范式：`TcpListener` + `service_fn`，
//! 每条连接一个 task。协议层只认 POST /mcp，其余路径 404。

use crate::AppState;
use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use std::sync::Arc;
use tauri::Manager;
use tokio::net::TcpListener;
use tokio::sync::Mutex as TokioMutex;

/// MCP 固定端口。避开 mock 的 23330/23331。
pub const MCP_PORT: u16 = 23332;

/// 支持的协议版本，新的在前
const SUPPORTED_VERSIONS: &[&str] = &["2025-06-18", "2025-03-26", "2024-11-05"];

/// 服务器运行状态（AIPage 展示用）
#[derive(Debug, Clone, serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub running: bool,
    pub port: u16,
    pub endpoint: String,
    pub error: Option<String>,
}

/// 服务器句柄：持有实际端口与停止标志
pub struct McpServerHandle {
    pub port: u16,
    status: Arc<std::sync::Mutex<McpStatus>>,
}

impl McpServerHandle {
    pub fn snapshot(&self) -> McpStatus {
        self.status
            .lock()
            .map(|status| status.clone())
            .unwrap_or_default()
    }
}

/// 进程内单例：由 lib.rs setup 启动后存进 AppState
pub type ServerSlot = Arc<TokioMutex<Option<McpServerHandle>>>;

/// 查当前状态（给 `app_get_status` 与 AIPage 用）
pub fn status(app: &tauri::AppHandle) -> McpStatus {
    let state = app.state::<AppState>();
    state
        .mcp_server
        .try_lock()
        .ok()
        .and_then(|slot| slot.as_ref().map(|handle| handle.snapshot()))
        .unwrap_or_default()
}

/// 启动服务器。已启动则直接返回现有状态（幂等）。
pub async fn spawn_server(app: tauri::AppHandle) -> Result<McpStatus, String> {
    let slot = {
        let state = app.state::<AppState>();
        state.mcp_server.clone()
    };

    let mut guard = slot.lock().await;
    if let Some(handle) = guard.as_ref() {
        return Ok(handle.snapshot());
    }

    // 启动时确保 token 已生成；实际鉴权每次请求都重读，
    // 否则重置 token 后旧 token 仍能用到进程重启（安全问题）
    {
        let state = app.state::<AppState>();
        crate::mcp::token::ensure_token(state.inner())?;
    }

    let listener = match TcpListener::bind(("127.0.0.1", MCP_PORT)).await {
        Ok(listener) => listener,
        Err(error) => {
            let status = McpStatus {
                running: false,
                port: 0,
                endpoint: String::new(),
                error: Some(format!("端口 {MCP_PORT} 绑定失败：{error}")),
            };
            log::warn!("[mcp] {}", status.error.clone().unwrap_or_default());
            *guard = Some(McpServerHandle {
                port: 0,
                status: Arc::new(std::sync::Mutex::new(status.clone())),
            });
            return Ok(status);
        }
    };

    let port = listener
        .local_addr()
        .map_err(|error| format!("获取 MCP 端口失败: {error}"))?
        .port();

    let status_value = McpStatus {
        running: true,
        port,
        endpoint: format!("http://127.0.0.1:{port}/mcp"),
        error: None,
    };
    log::info!("[mcp] 服务已启动：{}", status_value.endpoint);
    crate::ai::audit::note(&app, &format!("MCP 服务已启动 {}", status_value.endpoint));

    let status_slot = Arc::new(std::sync::Mutex::new(status_value.clone()));
    let app_for_loop = app.clone();

    tokio::spawn(async move {
        loop {
            let (stream, _) = match listener.accept().await {
                Ok(accepted) => accepted,
                Err(error) => {
                    log::error!("[mcp] accept 失败: {error}");
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    continue;
                }
            };

            let app = app_for_loop.clone();

            tokio::spawn(async move {
                let io = TokioIo::new(stream);
                let service = service_fn(move |request: Request<Incoming>| {
                    let app = app.clone();
                    async move { handle_request(app, request).await }
                });

                if let Err(error) = http1::Builder::new().serve_connection(io, service).await {
                    log::trace!("[mcp] 连接结束: {error}");
                }
            });
        }
    });

    *guard = Some(McpServerHandle {
        port,
        status: status_slot,
    });

    Ok(status_value)
}

async fn handle_request(
    app: tauri::AppHandle,
    request: Request<Incoming>,
) -> Result<Response<Full<Bytes>>, hyper::Error> {
    let path = request.uri().path().to_string();

    if path != "/mcp" {
        return Ok(text_response(StatusCode::NOT_FOUND, "not found"));
    }

    // Streamable HTTP 的 GET 用于 SSE 流；本实现不提供，按规范回 405
    if request.method() != Method::POST {
        return Ok(text_response(StatusCode::METHOD_NOT_ALLOWED, "POST only"));
    }

    // Bearer 校验：同机其它进程不持 token 就无法调用。
    // token 每次请求重读，保证「重置 token」立即生效
    let current_token = {
        let state = app.state::<AppState>();
        crate::mcp::token::ensure_token(state.inner())
    };
    let authorized = match current_token {
        Ok(token) => request
            .headers()
            .get(hyper::header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))
            .map(|candidate| constant_time_eq(candidate.trim(), token.as_str()))
            .unwrap_or(false),
        Err(error) => {
            log::warn!("[mcp] 读取 token 失败: {error}");
            false
        }
    };

    if !authorized {
        return Ok(text_response(StatusCode::UNAUTHORIZED, "invalid token"));
    }

    let body = match request.into_body().collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(error) => {
            log::warn!("[mcp] 读取请求体失败: {error}");
            return Ok(text_response(StatusCode::BAD_REQUEST, "bad body"));
        }
    };

    let text = match std::str::from_utf8(&body) {
        Ok(text) => text,
        Err(_) => return Ok(text_response(StatusCode::BAD_REQUEST, "invalid utf-8")),
    };

    let response = crate::mcp::handlers::handle_message(&app, text).await;
    match response {
        Some(payload) => Ok(json_response(StatusCode::OK, payload)),
        // 通知类请求无响应体，按 MCP 规范回 202
        None => Ok(Response::builder()
            .status(StatusCode::ACCEPTED)
            .header(hyper::header::CONTENT_TYPE, "application/json")
            .body(Full::new(Bytes::new()))
            .expect("构造空响应")),
    }
}

/// 处理工具调用：走统一调度入口，因此权限与 AI 日志对 MCP 同样生效。
pub async fn call_tool_for_mcp(
    app: &tauri::AppHandle,
    name: &str,
    args: serde_json::Value,
) -> crate::ai::spec::ToolResult {
    let state = app.state::<AppState>();
    crate::ai::dispatch::call_tool(app, state.inner(), name, args).await
}

pub fn supported_versions() -> &'static [&'static str] {
    SUPPORTED_VERSIONS
}

fn json_response(status: StatusCode, payload: serde_json::Value) -> Response<Full<Bytes>> {
    let body = serde_json::to_vec(&payload).unwrap_or_else(|_| b"{}".to_vec());
    Response::builder()
        .status(status)
        .header(hyper::header::CONTENT_TYPE, "application/json")
        .body(Full::new(Bytes::from(body)))
        .expect("构造 JSON 响应")
}

fn text_response(status: StatusCode, text: &str) -> Response<Full<Bytes>> {
    Response::builder()
        .status(status)
        .header(hyper::header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(Full::new(Bytes::from(text.to_string())))
        .expect("构造文本响应")
}

/// 定长比较，避免按字节提前返回泄露 token 前缀
fn constant_time_eq(a: &str, b: &str) -> bool {
    let a = a.as_bytes();
    let b = b.as_bytes();
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (left, right) in a.iter().zip(b.iter()) {
        diff |= left ^ right;
    }
    diff == 0
}
