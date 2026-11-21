//! 直播间长会话（仅 AI/MCP 使用）。
//!
//! 与 [`crate::bili::room_sample`] 的一次性采样不同，这里开一个后台任务长期挂着目标
//! 房间：心跳保活、断线重连、事件写入带 `seq` 的环形缓冲。AI 通过游标增量拉取，
//! 自己决定什么时候总结。会话不切换当前直播间、不开窗口、不写前端状态。

use crate::ai::context::TranscriptEntry;
use crate::bili::api::BiliApiClient;
use crate::bili::protocol::{decode_packets, heartbeat_packet, parse_danmaku_events, ParsedPacket};
use crate::models::message::DanmakuEvent;
use crate::stt::SttTranscript;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tokio::time::{Duration, Instant};
use tokio_tungstenite::tungstenite::Message;

/// 同时存在的活动会话上限（每个会话一条 WS 连接 + 一份缓冲）
pub const MAX_ACTIVE_SESSIONS: usize = 3;
/// 单会话默认缓冲条数
pub const DEFAULT_MAX_EVENTS: usize = 20_000;
/// 结束超过两小时的会话在下一次 start 时清理
const ENDED_RETENTION_SECS: u64 = 2 * 60 * 60;
const HEARTBEAT_SECS: u64 = 30;
const RECONNECT_BACKOFFS: [u64; 4] = [5, 10, 30, 60];

/// 会话里存的一条事件。缓冲永远保留原始数据，过滤/聚合只发生在读取时。
#[derive(Debug, Clone)]
pub enum StoredEvent {
    Danmaku(DanmakuEvent),
    Transcript {
        text: String,
        audio_ts_ms: i64,
        timestamp: u64,
    },
}

impl StoredEvent {
    pub fn kind(&self) -> &'static str {
        match self {
            StoredEvent::Danmaku(event) => match event.event_type.as_str() {
                "danmaku" => "danmaku",
                "gift" => "gift",
                "superChat" => "super_chat",
                "guard" => "guard",
                "entry" => "enter",
                "like" => "like",
                "live" => "live",
                _ => "other",
            },
            StoredEvent::Transcript { .. } => "transcript",
        }
    }
}

pub struct WatchSession {
    pub session_id: String,
    pub room_id: u64,
    pub real_room_id: u64,
    pub title: String,
    pub anchor: String,
    pub started_at: u64,
    /// 保底时长（秒）；0 = 不限
    pub max_seconds: u64,
    pub max_events: usize,
    pub stop_on_end: bool,
    pub with_transcript: bool,
    /// 会话默认是否带发送者信息（collect 可按次覆盖，不重建连接）
    pub include_senders: bool,
    pub events: VecDeque<(u64, StoredEvent)>,
    /// 下一条事件使用的 seq（从 1 开始）
    pub next_seq: u64,
    /// 早于该 seq 的事件已被环形缓冲淘汰
    pub evicted_before: u64,
    pub received: u64,
    pub dropped: u64,
    pub reconnects: u64,
    pub connected: bool,
    pub ended: bool,
    pub end_reason: Option<String>,
    pub last_error: Option<String>,
    pub last_event_at: u64,
    pub transcript_count: u64,
    pub stop_notify: Arc<tokio::sync::Notify>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub session_id: String,
    pub room_id: u64,
    pub real_room_id: u64,
    pub title: String,
    pub anchor: String,
    pub started_at: u64,
    pub max_minutes: u64,
    pub max_events: usize,
    pub stop_on_end: bool,
    pub with_transcript: bool,
    pub include_senders: bool,
    pub buffered: usize,
    pub received: u64,
    pub dropped: u64,
    pub reconnects: u64,
    pub connected: bool,
    pub ended: bool,
    pub end_reason: Option<String>,
    pub last_error: Option<String>,
    pub next_seq: u64,
    pub evicted_before: u64,
    pub last_event_at: u64,
    pub transcript_count: u64,
}

impl WatchSession {
    pub fn summary(&self) -> SessionSummary {
        SessionSummary {
            session_id: self.session_id.clone(),
            room_id: self.room_id,
            real_room_id: self.real_room_id,
            title: self.title.clone(),
            anchor: self.anchor.clone(),
            started_at: self.started_at,
            max_minutes: self.max_seconds / 60,
            max_events: self.max_events,
            stop_on_end: self.stop_on_end,
            with_transcript: self.with_transcript,
            include_senders: self.include_senders,
            buffered: self.events.len(),
            received: self.received,
            dropped: self.dropped,
            reconnects: self.reconnects,
            connected: self.connected,
            ended: self.ended,
            end_reason: self.end_reason.clone(),
            last_error: self.last_error.clone(),
            next_seq: self.next_seq,
            evicted_before: self.evicted_before,
            last_event_at: self.last_event_at,
            transcript_count: self.transcript_count,
        }
    }
}

/// 全部长会话。挂在 `AppState.live_watch` 上，进程生命周期内有效。
#[derive(Default)]
pub struct WatchManager {
    sessions: Mutex<HashMap<String, Arc<Mutex<WatchSession>>>>,
    cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
    next_id: AtomicU64,
}

#[allow(clippy::too_many_arguments)]
impl WatchManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get(&self, session_id: &str) -> Option<Arc<Mutex<WatchSession>>> {
        self.sessions
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .get(session_id)
            .cloned()
    }

    /// 把 LiveContext 已累积的字幕回填进会话缓冲开头（withTranscript 会话起步就有历史可读）。
    /// 调用方必须在订阅 transcript_bus **之前**读取缓冲，否则同一条字幕可能走两条路进来。
    pub fn backfill_transcripts(&self, session_id: &str, entries: &[TranscriptEntry]) {
        let Some(session) = self.get(session_id) else {
            return;
        };
        let mut guard = lock(&session);
        if guard.ended {
            return;
        }
        for entry in entries {
            push_transcript_inner(&mut guard, &entry.text, entry.audio_ts_ms, entry.timestamp as u64);
        }
    }

    pub fn list(&self) -> Vec<SessionSummary> {
        let sessions = self
            .sessions
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let mut summaries: Vec<SessionSummary> = sessions
            .values()
            .map(|session| lock(session).summary())
            .collect();
        summaries.sort_by_key(|summary| summary.started_at);
        summaries
    }

    /// 开一个会话并启动后台采集任务。
    #[allow(clippy::too_many_arguments)]
    pub fn start(
        &self,
        api: BiliApiClient,
        room_id: u64,
        real_room_id: u64,
        title: String,
        anchor: String,
        max_seconds: u64,
        max_events: usize,
        stop_on_end: bool,
        with_transcript: bool,
        include_senders: bool,
        transcript_rx: Option<broadcast::Receiver<SttTranscript>>,
    ) -> Result<SessionSummary, String> {
        self.prune_ended();
        {
            let sessions = self
                .sessions
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            let active = sessions
                .values()
                .filter(|session| !lock(session).ended)
                .count();
            if active >= MAX_ACTIVE_SESSIONS {
                return Err(format!(
                    "已有 {active} 个长会话在跑，最多同时 {MAX_ACTIVE_SESSIONS} 个；先 live_watch_stop 掉不用的"
                ));
            }
        }

        let id = format!("w{}", self.next_id.fetch_add(1, Ordering::Relaxed) + 1);
        let session = Arc::new(Mutex::new(WatchSession {
            session_id: id.clone(),
            room_id,
            real_room_id,
            title,
            anchor,
            started_at: now_secs_u64(),
            max_seconds,
            max_events: max_events.max(100),
            stop_on_end,
            with_transcript,
            include_senders,
            events: VecDeque::new(),
            next_seq: 1,
            evicted_before: 1,
            received: 0,
            dropped: 0,
            reconnects: 0,
            connected: false,
            ended: false,
            end_reason: None,
            last_error: None,
            last_event_at: 0,
            transcript_count: 0,
            stop_notify: Arc::new(tokio::sync::Notify::new()),
        }));
        let cancel = Arc::new(AtomicBool::new(false));

        self.sessions
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .insert(id.clone(), session.clone());
        self.cancels
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .insert(id.clone(), cancel.clone());

        let task_session = session.clone();
        tokio::spawn(async move {
            run_watch(api, room_id, task_session, cancel, transcript_rx).await;
        });

        let summary = lock(&session).summary();
        Ok(summary)
    }

    /// 停止会话。`remove = true` 时同时丢弃缓冲。
    pub fn stop(&self, session_id: &str, remove: bool) -> Result<SessionSummary, String> {
        let session = self
            .get(session_id)
            .ok_or_else(|| format!("会话 {session_id} 不存在"))?;

        if let Some(cancel) = self
            .cancels
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .remove(session_id)
        {
            cancel.store(true, Ordering::Relaxed);
        }
        let summary = {
            let mut guard = lock(&session);
            if !guard.ended {
                guard.ended = true;
                guard.end_reason = Some("手动停止".to_string());
            }
            guard.connected = false;
            guard.stop_notify.notify_one();
            guard.summary()
        };

        if remove {
            self.sessions
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .remove(session_id);
        }
        Ok(summary)
    }

    /// 清理结束超过两小时的会话，避免长期运行后堆积。
    fn prune_ended(&self) {
        let now = now_secs_u64();
        let mut sessions = self
            .sessions
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        sessions.retain(|_, session| {
            let session = lock(session);
            !(session.ended && now.saturating_sub(session.last_event_at.max(session.started_at)) > ENDED_RETENTION_SECS)
        });
    }
}

fn now_secs_u64() -> u64 {
    crate::ai::context::now_secs().max(0) as u64
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|error| error.into_inner())
}

fn mark_finished(session: &Arc<Mutex<WatchSession>>, reason: &str) {
    let mut guard = lock(session);
    guard.connected = false;
    guard.ended = true;
    guard.end_reason = Some(reason.to_string());
}

fn push_danmaku(session: &Arc<Mutex<WatchSession>>, event: DanmakuEvent) {
    let mut guard = lock(session);
    let seq = guard.next_seq;
    guard.next_seq += 1;
    guard.received += 1;
    guard.last_event_at = now_secs_u64();
    while guard.events.len() >= guard.max_events {
        let Some((old_seq, old)) = guard.events.pop_front() else {
            break;
        };
        guard.dropped += 1;
        guard.evicted_before = old_seq + 1;
        if matches!(old, StoredEvent::Transcript { .. }) {
            guard.transcript_count = guard.transcript_count.saturating_sub(1);
        }
    }
    guard.events.push_back((seq, StoredEvent::Danmaku(event)));
}

fn push_transcript(session: &Arc<Mutex<WatchSession>>, transcript: SttTranscript) {
    // 只存定稿片段：流式识别的中间结果会大量刷屏
    if !transcript.is_final {
        return;
    }
    let mut guard = lock(session);
    push_transcript_inner(
        &mut guard,
        &transcript.text,
        transcript.audio_ts_ms,
        now_secs_u64(),
    );
}

/// 已持锁的写入路径：live 推送与上下文回填共用同一套淘汰与计数。
fn push_transcript_inner(
    guard: &mut WatchSession,
    raw_text: &str,
    audio_ts_ms: i64,
    timestamp: u64,
) {
    let text = raw_text.trim().to_string();
    if text.is_empty() {
        return;
    }
    let seq = guard.next_seq;
    guard.next_seq += 1;
    guard.received += 1;
    guard.transcript_count += 1;
    guard.last_event_at = now_secs_u64();
    while guard.events.len() >= guard.max_events {
        let Some((old_seq, old)) = guard.events.pop_front() else {
            break;
        };
        guard.dropped += 1;
        guard.evicted_before = old_seq + 1;
        if matches!(old, StoredEvent::Transcript { .. }) {
            guard.transcript_count = guard.transcript_count.saturating_sub(1);
        }
    }
    guard.events.push_back((
        seq,
        StoredEvent::Transcript {
            text,
            audio_ts_ms,
            timestamp,
        },
    ));
}

async fn wait_deadline(deadline: Option<Instant>) {
    match deadline {
        Some(deadline) => tokio::time::sleep_until(deadline).await,
        None => std::future::pending().await,
    }
}

async fn next_transcript(
    rx: &mut Option<broadcast::Receiver<SttTranscript>>,
) -> Option<Result<SttTranscript, broadcast::error::RecvError>> {
    match rx.as_mut() {
        Some(rx) => Some(rx.recv().await),
        None => std::future::pending().await,
    }
}

/// 可被取消打断的等待
async fn sleep_or_cancel(cancel: &AtomicBool, deadline: Option<Instant>, duration: Duration) -> bool {
    let until = Instant::now() + duration;
    loop {
        if cancel.load(Ordering::Relaxed) {
            return true;
        }
        if let Some(deadline) = deadline {
            if Instant::now() >= deadline {
                return true;
            }
        }
        let now = Instant::now();
        if now >= until {
            return false;
        }
        let step = (until - now).min(Duration::from_millis(250));
        tokio::time::sleep(step).await;
    }
}

async fn run_watch(
    api: BiliApiClient,
    room_id: u64,
    session: Arc<Mutex<WatchSession>>,
    cancel: Arc<AtomicBool>,
    mut transcript_rx: Option<broadcast::Receiver<SttTranscript>>,
) {
    let (max_seconds, stop_on_end, stop_notify) = {
        let guard = lock(&session);
        (guard.max_seconds, guard.stop_on_end, guard.stop_notify.clone())
    };
    let deadline = (max_seconds > 0).then(|| Instant::now() + Duration::from_secs(max_seconds));
    let mut backoff_index = 0usize;

    loop {
        if cancel.load(Ordering::Relaxed) {
            mark_finished(&session, "手动停止");
            break;
        }
        if deadline.map(|value| Instant::now() >= value).unwrap_or(false) {
            mark_finished(&session, "达到保底时长");
            break;
        }

        match crate::bili::room_sample::connect_room_socket(&api, room_id).await {
            Ok(stream) => {
                backoff_index = 0;
                {
                    let mut guard = lock(&session);
                    guard.connected = true;
                    guard.last_error = None;
                }
                let (mut writer, mut reader) = stream.split();
                let Ok(first_heartbeat) = heartbeat_packet() else {
                    mark_finished(&session, "心跳构造失败");
                    break;
                };
                if writer
                    .send(Message::Binary(first_heartbeat.into()))
                    .await
                    .is_err()
                {
                    // 首帧就写失败：按断线处理
                    lock(&session).connected = false;
                    let _ = sleep_or_cancel(
                        &cancel,
                        deadline,
                        Duration::from_secs(RECONNECT_BACKOFFS[0]),
                    )
                    .await;
                    continue;
                }
                let mut heartbeat = tokio::time::interval(Duration::from_secs(HEARTBEAT_SECS));
                heartbeat.tick().await; // 上面已发过首帧

                let mut end_reason: Option<String> = None;
                loop {
                    if cancel.load(Ordering::Relaxed) {
                        end_reason = Some("手动停止".to_string());
                        break;
                    }
                    tokio::select! {
                        _ = stop_notify.notified() => {
                            end_reason = Some("手动停止".to_string());
                            break;
                        }
                        _ = wait_deadline(deadline) => {
                            end_reason = Some("达到保底时长".to_string());
                            break;
                        }
                        _ = heartbeat.tick() => {
                            let Ok(packet) = heartbeat_packet() else { break; };
                            if writer.send(Message::Binary(packet.into())).await.is_err() {
                                break;
                            }
                        }
                        transcript = next_transcript(&mut transcript_rx) => {
                            match transcript {
                                Some(Ok(transcript)) => push_transcript(&session, transcript),
                                Some(Err(broadcast::error::RecvError::Lagged(count))) => {
                                    lock(&session).dropped += count;
                                }
                                Some(Err(broadcast::error::RecvError::Closed)) => {
                                    transcript_rx = None;
                                }
                                None => {}
                            }
                        }
                        message = reader.next() => {
                            let Some(message) = message else { break; };
                            let Ok(message) = message else { break; };
                            let Message::Binary(bytes) = message else { continue; };
                            let Ok(packets) = decode_packets(&bytes) else { continue; };
                            for packet in packets {
                                let ParsedPacket::Command(command) = packet else { continue; };
                                let cmd = command
                                    .get("cmd")
                                    .and_then(serde_json::Value::as_str)
                                    .unwrap_or("");
                                for event in parse_danmaku_events(&command, room_id) {
                                    push_danmaku(&session, event);
                                }
                                if stop_on_end && cmd.starts_with("PREPARING") {
                                    end_reason = Some("主播下播".to_string());
                                }
                            }
                            if end_reason.is_some() {
                                break;
                            }
                        }
                    }
                }

                lock(&session).connected = false;
                if let Some(reason) = end_reason {
                    mark_finished(&session, &reason);
                    break;
                }
                // 连接断开：退避后重连
                {
                    let mut guard = lock(&session);
                    guard.reconnects += 1;
                    guard.last_error = Some("连接中断，准备重连".to_string());
                }
                let wait = RECONNECT_BACKOFFS[backoff_index.min(RECONNECT_BACKOFFS.len() - 1)];
                backoff_index = (backoff_index + 1).min(RECONNECT_BACKOFFS.len() - 1);
                if sleep_or_cancel(&cancel, deadline, Duration::from_secs(wait)).await {
                    mark_finished(
                        &session,
                        if cancel.load(Ordering::Relaxed) {
                            "手动停止"
                        } else {
                            "达到保底时长"
                        },
                    );
                    break;
                }
            }
            Err(error) => {
                {
                    let mut guard = lock(&session);
                    guard.reconnects += 1;
                    guard.last_error = Some(error);
                }
                let wait = RECONNECT_BACKOFFS[backoff_index.min(RECONNECT_BACKOFFS.len() - 1)];
                backoff_index = (backoff_index + 1).min(RECONNECT_BACKOFFS.len() - 1);
                if sleep_or_cancel(&cancel, deadline, Duration::from_secs(wait)).await {
                    mark_finished(
                        &session,
                        if cancel.load(Ordering::Relaxed) {
                            "手动停止"
                        } else {
                            "达到保底时长"
                        },
                    );
                    break;
                }
            }
        }
    }
}
