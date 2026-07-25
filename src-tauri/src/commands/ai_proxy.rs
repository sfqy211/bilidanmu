use crate::{selections_store, AppState};
use http_body_util::BodyExt;
use serde::{Deserialize, Serialize};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex as StdMutex};
use tauri::{Manager, State};

/// AstrBot 回调消息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSuggestion {
    #[serde(rename = "type")]
    pub suggestion_type: String,
    pub room_id: u64,
    pub message: String,
    pub timestamp: u64,
}

/// AI 总结缓存（跨窗口共享）
pub type SummaryStore = Arc<StdMutex<Vec<AiSuggestion>>>;

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
    app: tauri::AppHandle,
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
    drop(cfg);

    // 如果回调端口变化，重启回调服务
    let current_port = *state.astrbot_callback_port.lock().await;
    if callback_port > 0 && current_port != callback_port {
        let port_state = state.astrbot_callback_port.clone();
        tokio::spawn(async move {
            match start_callback_server(app, callback_port).await {
                Ok(port) => {
                    *port_state.lock().await = port;
                    log::info!("AstrBot 回调服务已重启: http://127.0.0.1:{port}/astrbot/callback");
                }
                Err(e) => log::error!("重启回调服务失败: {e}"),
            }
        });
    }

    Ok(())
}

/// 获取 AstrBot 配置（自动从磁盘加载）
#[tauri::command]
pub async fn get_astrbot_config(state: State<'_, AppState>) -> Result<Option<AstrbotConfig>, String> {
    Ok(get_or_load_config(&state).await)
}

/// 确保配置已加载（内存优先，否则从磁盘读取）
async fn get_or_load_config(state: &State<'_, AppState>) -> Option<AstrbotConfig> {
    let cfg = state.astrbot_config.lock().await;
    if cfg.is_some() {
        return cfg.clone();
    }
    drop(cfg);
    let loaded = load_config_from_store(state.inner());
    if let Some(ref config) = loaded {
        let mut cfg = state.astrbot_config.lock().await;
        *cfg = Some(config.clone());
    }
    loaded
}

/// 获取回调服务实际端口
#[tauri::command]
pub async fn get_callback_port(state: State<'_, AppState>) -> Result<u16, String> {
    let port = state.astrbot_callback_port.lock().await;
    Ok(*port)
}

/// 切换 AstrBot 直播间
#[tauri::command]
pub async fn switch_astrbot_room(
    room_id: u64,
    callback_url: Option<String>,
    uname: Option<String>,
    title: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let config = get_or_load_config(&state).await.ok_or("AstrBot 未配置")?;
    let url = format!("http://{}:{}/api/switch-room", config.host, config.http_port);

    let mut payload = serde_json::json!({ "room_id": room_id });
    if let Some(cb) = callback_url {
        if !cb.is_empty() {
            payload["callback_url"] = serde_json::json!(cb);
        }
    }
    if let Some(u) = uname.filter(|v| !v.is_empty()) {
        payload["uname"] = serde_json::json!(u);
    }
    if let Some(t) = title.filter(|v| !v.is_empty()) {
        payload["title"] = serde_json::json!(t);
    }

    let resp = state.astrbot_client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("连接 AstrBot 失败: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("AstrBot 切房失败: {body}"));
    }
    state.astrbot_active.store(true, Ordering::Relaxed);
    Ok(())
}

/// 断开 AstrBot 连接
#[tauri::command]
pub async fn disconnect_astrbot(state: State<'_, AppState>) -> Result<(), String> {
    let config = get_or_load_config(&state).await;
    let Some(config) = config else { return Ok(()) };
    let url = format!("http://{}:{}/api/disconnect", config.host, config.http_port);

    let resp = state.astrbot_client
        .post(&url)
        .send()
        .await
        .map_err(|e| format!("连接 AstrBot 失败: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("AstrBot 断开失败: {body}"));
    }
    state.astrbot_active.store(false, Ordering::Relaxed);
    Ok(())
}

/// 手动触发 AI 回复/总结
#[tauri::command]
pub async fn trigger_astrbot(
    action: String,
    context: String,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    if action != "reply" && action != "summary" {
        return Err(format!("无效的 action: {action}，只支持 reply 或 summary"));
    }

    let config = get_or_load_config(&state).await.ok_or("AstrBot 未配置")?;
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

    json.get("replies")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .ok_or_else(|| "AstrBot 响应缺少 replies 字段".to_string())
}

/// 后台学习用户偏好
#[tauri::command]
pub async fn learn_astrbot(
    chosen: String,
    options: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let config = get_or_load_config(&state).await.ok_or("AstrBot 未配置")?;
    let url = format!("http://{}:{}/api/learn", config.host, config.http_port);

    let resp = state.astrbot_client
        .post(&url)
        .json(&serde_json::json!({ "chosen": chosen, "options": options }))
        .send()
        .await
        .map_err(|e| format!("连接 AstrBot 失败: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("AstrBot 学习触发失败: {body}"));
    }
    Ok(())
}

/// 获取缓存的 AI 总结
#[tauri::command]
pub async fn get_ai_summaries(state: State<'_, AppState>) -> Result<Vec<AiSuggestion>, String> {
    let summaries = state.ai_summaries.lock()
        .map_err(|_| "获取总结锁失败".to_string())?;
    Ok(summaries.clone())
}

/// 清空缓存的 AI 总结
#[tauri::command]
pub async fn clear_ai_summaries(state: State<'_, AppState>) -> Result<(), String> {
    let mut summaries = state.ai_summaries.lock()
        .map_err(|_| "获取总结锁失败".to_string())?;
    summaries.clear();
    Ok(())
}

/// 获取 AstrBot 状态
#[tauri::command]
pub async fn get_astrbot_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let config = get_or_load_config(&state).await.ok_or("AstrBot 未配置")?;
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

                            match serde_json::from_slice::<AiSuggestion>(&body) {
                                Ok(suggestion) => {
                                    log::info!("[AI回调] 收到: type={}, room={}", suggestion.suggestion_type, suggestion.room_id);
                                    // 存储到 AppState
                                    let state = app_handle.state::<AppState>();
                                    let mut summaries = state.ai_summaries.lock().unwrap();
                                    summaries.push(suggestion);
                                    if summaries.len() > 100 {
                                        let drain_count = summaries.len() - 100;
                                        summaries.drain(..drain_count);
                                    }
                                    drop(summaries);
                                }
                                Err(e) => {
                                    log::error!("AstrBot 回调解析失败: {e}, body={}", String::from_utf8_lossy(&body));
                                }
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
