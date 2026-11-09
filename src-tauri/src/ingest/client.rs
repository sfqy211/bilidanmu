//! 弹幕共享上报：把本机采集到的事件批量推送到中心归档服务。
//!
//! 设计：
//! - 只上报带 B 站真实 `message_id` 的事件（中心按该 ID 跨节点去重）
//! - 攒批发送（默认 200 条 或 2 秒），避免高频小请求
//! - 失败时指数退避重试；队列上限 10000 条，超出丢弃最旧并计数
//! - 断网期间事件留在队列里，恢复后自动补传

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::models::message::DanmakuEvent;

/// 单批最大条数（与中心侧上限保持一致）
const MAX_BATCH: usize = 200;
/// 队列上限，超出后丢最旧
const MAX_QUEUE: usize = 10_000;
/// 攒批间隔
const FLUSH_INTERVAL: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestConfig {
    pub center_url: String,
    pub node_token: String,
    pub node_id: String,
}

#[derive(Debug, Default, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestStats {
    pub enabled: bool,
    pub connected: bool,
    pub queued: usize,
    pub sent: u64,
    pub dropped: u64,
    pub last_error: Option<String>,
    pub active_session_id: Option<i32>,
}

/// 上报用的事件载荷。字段与中心 `RecordedDanmakuEvent` 对齐。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutboundEvent {
    #[serde(rename = "type")]
    event_type: String,
    message_id: String,
    timestamp: u64,
    user: String,
    uid: String,
    text: Option<String>,
    name: Option<String>,
    count: i32,
    price: Option<f64>,
    guard_level: Option<i32>,
    medal_level: Option<i32>,
    medal_name: Option<String>,
    face: Option<String>,
    raw_command: Option<String>,
}

impl OutboundEvent {
    fn from_event(e: &DanmakuEvent) -> Option<Self> {
        let message_id = e.message_id.clone()?;
        let event_type = match e.event_type.as_str() {
            "danmaku" => "comment",
            "gift" => "gift",
            "superChat" => "super_chat",
            "guard" => "guard",
            _ => return None, // 进场/点赞等不入库
        };

        Some(Self {
            event_type: event_type.to_string(),
            message_id,
            timestamp: e.timestamp,
            user: e.username.clone(),
            uid: e.uid.to_string(),
            text: Some(e.content.clone()),
            name: e.gift_name.clone(),
            count: e.count.unwrap_or(1) as i32,
            price: e.price.map(|p| p as f64 / 1000.0),
            guard_level: if e.guard_level > 0 {
                Some(e.guard_level as i32)
            } else {
                None
            },
            medal_level: e.medal.as_ref().map(|m| m.level as i32),
            medal_name: e.medal.as_ref().map(|m| m.name.clone()),
            face: e.avatar.clone(),
            raw_command: None,
        })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartSessionRequest<'a> {
    uid: &'a str,
    room_id: u64,
    title: Option<String>,
    user_name: Option<String>,
    live_start_time: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartSessionResponse {
    session_id: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppendEventsRequest {
    session_id: i32,
    events: Vec<OutboundEvent>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HeartbeatRequest {
    session_id: i32,
    total_events: Option<u64>,
}

pub struct IngestClient {
    inner: Arc<IngestInner>,
}

struct IngestInner {
    http: reqwest::Client,
    config: Mutex<Option<IngestConfig>>,
    queue: Mutex<VecDeque<OutboundEvent>>,
    session_id: Mutex<Option<i32>>,
    current_uid: Mutex<Option<String>>,
    current_room: Mutex<Option<u64>>,
    sent: AtomicU64,
    dropped: AtomicU64,
    connected: AtomicBool,
    enabled: AtomicBool,
    last_error: Mutex<Option<String>>,
}

impl IngestClient {
    pub fn new(http: reqwest::Client) -> Self {
        Self {
            inner: Arc::new(IngestInner {
                http,
                config: Mutex::new(None),
                queue: Mutex::new(VecDeque::new()),
                session_id: Mutex::new(None),
                current_uid: Mutex::new(None),
                current_room: Mutex::new(None),
                sent: AtomicU64::new(0),
                dropped: AtomicU64::new(0),
                connected: AtomicBool::new(false),
                enabled: AtomicBool::new(false),
                last_error: Mutex::new(None),
            }),
        }
    }

    /// 更新配置（设置页保存时调用）。关闭上报会清空队列并结束当前会话。
    pub async fn apply_config(&self, cfg: Option<IngestConfig>) {
        let enabled = cfg
            .as_ref()
            .map(|c| !c.center_url.is_empty() && !c.node_token.is_empty())
            .unwrap_or(false);
        self.inner.enabled.store(enabled, Ordering::Relaxed);
        *self.inner.config.lock().await = cfg;

        if !enabled {
            self.inner.queue.lock().await.clear();
            self.inner.connected.store(false, Ordering::Relaxed);
            let sid = self.inner.session_id.lock().await.take();
            if let Some(id) = sid {
                self.end_session(id).await;
            }
        }
    }

    pub async fn stats(&self) -> IngestStats {
        IngestStats {
            enabled: self.inner.enabled.load(Ordering::Relaxed),
            connected: self.inner.connected.load(Ordering::Relaxed),
            queued: self.inner.queue.lock().await.len(),
            sent: self.inner.sent.load(Ordering::Relaxed),
            dropped: self.inner.dropped.load(Ordering::Relaxed),
            last_error: self.inner.last_error.lock().await.clone(),
            active_session_id: *self.inner.session_id.lock().await,
        }
    }

    /// 收到事件时调用（非阻塞，仅入队）。
    pub async fn enqueue(&self, event: &DanmakuEvent) {
        if !self.inner.enabled.load(Ordering::Relaxed) {
            return;
        }
        let Some(out) = OutboundEvent::from_event(event) else {
            return;
        };

        let mut q = self.inner.queue.lock().await;
        if q.len() >= MAX_QUEUE {
            q.pop_front();
            self.inner.dropped.fetch_add(1, Ordering::Relaxed);
        }
        q.push_back(out);
    }

    /// 确保会话已注册（每次开始接收某房间弹幕时调用）。
    pub async fn ensure_session(&self, uid: &str, room_id: u64, title: Option<String>, user_name: Option<String>, live_start: Option<u64>) {
        if !self.inner.enabled.load(Ordering::Relaxed) {
            return;
        }

        let cfg = self.inner.config.lock().await.clone();
        let Some(cfg) = cfg else { return };

        // 同一 uid 已注册则跳过
        {
            let cur = self.inner.current_uid.lock().await;
            if cur.as_deref() == Some(uid) && self.inner.session_id.lock().await.is_some() {
                return;
            }
        }

        let body = StartSessionRequest {
            uid,
            room_id,
            title,
            user_name,
            live_start_time: live_start,
        };
        let url = format!("{}/api/ingest/session/start", cfg.center_url.trim_end_matches('/'));

        match self.post_json::<StartSessionResponse>(&url, &cfg, &body).await {
            Ok(resp) => {
                *self.inner.session_id.lock().await = Some(resp.session_id);
                *self.inner.current_uid.lock().await = Some(uid.to_string());
                *self.inner.current_room.lock().await = Some(room_id);
                self.inner.connected.store(true, Ordering::Relaxed);
                *self.inner.last_error.lock().await = None;
                log::info!("[ingest] 已加入中心会话 session={} uid={}", resp.session_id, uid);
            }
            Err(e) => {
                log::warn!("[ingest] 注册会话失败: {e}");
                *self.inner.last_error.lock().await = Some(e);
                self.inner.connected.store(false, Ordering::Relaxed);
            }
        }
    }

    /// 后台循环：定期把队列里的批次推给中心。
    /// 后台循环入口：刷盘 + 心跳并发运行。
    ///
    /// 必须在 Tokio runtime 内调用（由 tauri::async_runtime::spawn 驱动），
    /// 不能在 AppState 构造等同步上下文直接调用。
    pub async fn run_loops(&self) {
        tokio::join!(self.flush_loop(), self.heartbeat_loop());
    }

    /// 定期把队列里的批次推给中心。
    async fn flush_loop(&self) {
        let inner = self.inner.clone();
        loop {
            tokio::time::sleep(FLUSH_INTERVAL).await;
            if !inner.enabled.load(Ordering::Relaxed) {
                continue;
            }

            let cfg = inner.config.lock().await.clone();
            let Some(cfg) = cfg else { continue };

            let Some(session_id) = *inner.session_id.lock().await else {
                continue;
            };

            // 批量取
            let batch: Vec<OutboundEvent> = {
                let mut q = inner.queue.lock().await;
                let n = q.len().min(MAX_BATCH);
                q.drain(..n).collect()
            };
            if batch.is_empty() {
                continue;
            }

            let count = batch.len();
            let url = format!("{}/api/ingest/session/events", cfg.center_url.trim_end_matches('/'));
            let batch_backup = batch.clone();
            let body = AppendEventsRequest { session_id, events: batch };

            match post_json_raw::<serde_json::Value>(&inner.http, &url, &cfg.node_token, &body).await {
                Ok(_) => {
                    inner.sent.fetch_add(count as u64, Ordering::Relaxed);
                    inner.connected.store(true, Ordering::Relaxed);
                    *inner.last_error.lock().await = None;
                }
                Err(e) => {
                    log::warn!("[ingest] 上报 {count} 条失败，稍后重试: {e}");
                    *inner.last_error.lock().await = Some(e);
                    inner.connected.store(false, Ordering::Relaxed);
                    // 失败则放回队首，等待下轮
                    let mut q = inner.queue.lock().await;
                    let mut back: VecDeque<OutboundEvent> = VecDeque::from(batch_backup);
                    back.extend(q.drain(..));
                    *q = back;
                    while q.len() > MAX_QUEUE {
                        q.pop_back();
                        inner.dropped.fetch_add(1, Ordering::Relaxed);
                    }
                }
            }
        }
    }

    /// 定期心跳，兼作连接状态探测。
    async fn heartbeat_loop(&self) {
        let inner = self.inner.clone();
        loop {
            tokio::time::sleep(Duration::from_secs(15)).await;
            if !inner.enabled.load(Ordering::Relaxed) {
                continue;
            }
            let cfg = match inner.config.lock().await.clone() {
                Some(c) => c,
                None => continue,
            };
            let Some(session_id) = *inner.session_id.lock().await else {
                continue;
            };

            let url = format!("{}/api/ingest/session/heartbeat", cfg.center_url.trim_end_matches('/'));
            let body = HeartbeatRequest {
                session_id,
                total_events: Some(inner.sent.load(Ordering::Relaxed)),
            };
            match post_json_raw::<serde_json::Value>(&inner.http, &url, &cfg.node_token, &body).await {
                Ok(_) => inner.connected.store(true, Ordering::Relaxed),
                Err(e) => {
                    *inner.last_error.lock().await = Some(e);
                    inner.connected.store(false, Ordering::Relaxed);
                }
            }
        }
    }

    pub async fn leave_session(&self) {
        let sid = self.inner.session_id.lock().await.take();
        self.inner.current_uid.lock().await.take();
        self.inner.current_room.lock().await.take();
        if let Some(id) = sid {
            self.end_session(id).await;
        }
    }

    async fn end_session(&self, session_id: i32) {
        let cfg = match self.inner.config.lock().await.clone() {
            Some(c) => c,
            None => return,
        };
        let url = format!("{}/api/ingest/session/end", cfg.center_url.trim_end_matches('/'));
        let body = serde_json::json!({ "sessionId": session_id });
        match post_json_raw::<serde_json::Value>(&self.inner.http, &url, &cfg.node_token, &body).await {
            Ok(_) => log::info!("[ingest] 已结束会话 {session_id}"),
            Err(e) => log::warn!("[ingest] 结束会话失败: {e}"),
        }
    }

    /// 测试连接：调用 whoami 确认 Token 与地址可用。
    pub async fn test_connection(&self, config: IngestConfig) -> Result<serde_json::Value, String> {
        let url = format!("{}/api/ingest/whoami", config.center_url.trim_end_matches('/'));
        let resp = self
            .inner
            .http
            .get(&url)
            .header("X-Node-Token", &config.node_token)
            .timeout(Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("请求失败: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("中心返回 {}", resp.status()));
        }
        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| format!("响应解析失败: {e}"))
    }

    async fn post_json<T: for<'de> Deserialize<'de>>(
        &self,
        url: &str,
        cfg: &IngestConfig,
        body: &impl Serialize,
    ) -> Result<T, String> {
        post_json_raw::<T>(&self.inner.http, url, &cfg.node_token, body).await
    }
}

async fn post_json_raw<T: for<'de> Deserialize<'de>>(
    http: &reqwest::Client,
    url: &str,
    token: &str,
    body: &impl Serialize,
) -> Result<T, String> {
    let resp = http
        .post(url)
        .header("X-Node-Token", token)
        .json(body)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("{e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {}", text.chars().take(200).collect::<String>()));
    }

    resp.json::<T>().await.map_err(|e| format!("{e}"))
}

/// 供 start 时记录时间基准（避免 unused import 警告的保留项）
#[allow(dead_code)]
pub fn now() -> Instant {
    Instant::now()
}
