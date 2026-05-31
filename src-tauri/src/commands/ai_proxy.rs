use crate::{selections_store, AppState};
use http_body_util::BodyExt;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

/// AstrBot 回调消息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSuggestion {
    pub room_id: u64,
    pub sender: String,
    pub sender_name: String,
    pub message: String,
}

/// AstrBot 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AstrbotConfig {
    pub host: String,
    pub http_port: u16,
    pub callback_port: u16,
}

const CONFIG_KEY: &str = "astrbot_config";

/// 从 selections_store 加载配置
fn load_config_from_store(state: &AppState) -> Option<AstrbotConfig> {
    let values = selections_store::load_values(state, &[CONFIG_KEY.to_string()]).ok()?;
    let text = values.get(CONFIG_KEY)?.as_str()?;
    serde_json::from_str(text).ok()
}

/// 保存配置到 selections_store
fn save_config_to_store(state: &AppState, config: &AstrbotConfig) -> Result<(), String> {
    let text = serde_json::to_string(config).map_err(|e| format!("序列化配置失败: {e}"))?;
    let mut entries = serde_json::Map::new();
    entries.insert(CONFIG_KEY.to_string(), serde_json::Value::String(text));
    selections_store::save_values(state, &entries)
}

/// 配置 AstrBot 连接地址
#[tauri::command]
pub async fn configure_astrbot(
    host: String,
    http_port: u16,
    callback_port: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let config = AstrbotConfig {
        host,
        http_port,
        callback_port,
    };
    save_config_to_store(state.inner(), &config)?;
    let mut cfg = state.astrbot_config.lock().await;
    *cfg = Some(config);
    Ok(())
}

/// 获取 AstrBot 配置
#[tauri::command]
pub async fn get_astrbot_config(state: State<'_, AppState>) -> Result<Option<AstrbotConfig>, String> {
    let cfg = state.astrbot_config.lock().await;
    if cfg.is_some() {
        return Ok(cfg.clone());
    }
    drop(cfg);
    // 从磁盘加载
    let loaded = load_config_from_store(state.inner());
    if let Some(ref config) = loaded {
        let mut cfg = state.astrbot_config.lock().await;
        *cfg = Some(config.clone());
    }
    Ok(loaded)
}

/// 获取回调服务实际端口
#[tauri::command]
pub async fn get_callback_port(state: State<'_, AppState>) -> Result<u16, String> {
    let port = state.astrbot_callback_port.lock().await;
    Ok(*port)
}

/// 切换 AstrBot 直播间
#[tauri::command]
pub async fn switch_astrbot_room(room_id: u64, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.astrbot_config.lock().await;
    let config = config.as_ref().ok_or("AstrBot 未配置")?;
    let url = format!("http://{}:{}/api/switch-room", config.host, config.http_port);

    let resp = state.astrbot_client
        .post(&url)
        .json(&serde_json::json!({ "room_id": room_id }))
        .send()
        .await
        .map_err(|e| format!("连接 AstrBot 失败: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("AstrBot 切房失败: {body}"));
    }
    Ok(())
}

/// 手动触发 AI 回复/总结
#[tauri::command]
pub async fn trigger_astrbot(
    action: String,
    context: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if action != "reply" && action != "summary" {
        return Err(format!("无效的 action: {action}，只支持 reply 或 summary"));
    }

    let config = state.astrbot_config.lock().await;
    let config = config.as_ref().ok_or("AstrBot 未配置")?;
    let url = format!("http://{}:{}/api/trigger", config.host, config.http_port);

    let resp = state.astrbot_client
        .post(&url)
        .json(&serde_json::json!({ "action": action, "context": context }))
        .send()
        .await
        .map_err(|e| format!("连接 AstrBot 失败: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("AstrBot 触发失败: {body}"));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 AstrBot 响应失败: {e}"))?;

    json.get("reply")
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| "AstrBot 响应缺少 reply 字段".to_string())
}

/// 获取 AstrBot 状态
#[tauri::command]
pub async fn get_astrbot_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let config = state.astrbot_config.lock().await;
    let config = config.as_ref().ok_or("AstrBot 未配置")?;
    let url = format!("http://{}:{}/api/status", config.host, config.http_port);

    let resp = state.astrbot_client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("连接 AstrBot 失败: {e}"))?;

    if !resp.status().is_success() {
        return Err("AstrBot 状态查询失败".to_string());
    }

    resp.json()
        .await
        .map_err(|e| format!("解析 AstrBot 状态失败: {e}"))
}

/// 启动回调 HTTP 服务（接收 AstrBot 的 AI 回复）
pub async fn start_callback_server(app_handle: tauri::AppHandle, port: u16) -> Result<u16, String> {
    use hyper::server::conn::http1;
    use hyper::service::service_fn;
    use hyper_util::rt::TokioIo;
    use tokio::net::TcpListener;

    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .await
        .map_err(|e| format!("绑定回调端口失败: {e}"))?;

    let actual_port = listener
        .local_addr()
        .map_err(|e| format!("获取端口失败: {e}"))?
        .port();

    tokio::spawn(async move {
        loop {
            let (stream, _) = match listener.accept().await {
                Ok(v) => v,
                Err(e) => {
                    log::error!("接受连接失败: {e}");
                    continue;
                }
            };

            let app_handle = app_handle.clone();
            tokio::spawn(async move {
                let io = TokioIo::new(stream);
                let service = service_fn(move |req| {
                    let app_handle = app_handle.clone();
                    async move {
                        if req.method() == hyper::Method::POST
                            && req.uri().path() == "/astrbot/callback"
                        {
                            let body = req
                                .collect()
                                .await
                                .map(|c: http_body_util::Collected<bytes::Bytes>| c.to_bytes())
                                .unwrap_or_default();

                            if let Ok(suggestion) = serde_json::from_slice::<AiSuggestion>(&body) {
                                let _ = app_handle.emit("ai-suggestion", &suggestion);
                            }

                            Ok::<_, hyper::Error>(
                                hyper::Response::new(http_body_util::Full::new(
                                    bytes::Bytes::from("ok"),
                                ))
                            )
                        } else {
                            Ok::<_, hyper::Error>(
                                hyper::Response::builder()
                                    .status(404)
                                    .body(http_body_util::Full::new(bytes::Bytes::new()))
                                    .unwrap(),
                            )
                        }
                    }
                });

                if let Err(e) = http1::Builder::new()
                    .serve_connection(io, service)
                    .await
                {
                    log::error!("HTTP 连接错误: {e}");
                }
            });
        }
    });

    Ok(actual_port)
}
