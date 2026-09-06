//! 虚拟直播间：本地模拟 B 站弹幕服务器。
//!
//! 通过环境变量 `BILIDANMU_MOCK=1` 启用（`npm run dev:mock`）。
//! 启用后监听 127.0.0.1，讲与真实弹幕服务器相同的二进制协议
//! （认证回包 / 心跳回包 / op=5 命令包），`ws_client` 对保留房间号
//! [`MOCK_ROOM_ID`] 改连本地，全链路（含协议解析）均可在无真实直播间时测试。
//!
//! 控制面：HTTP 端点（仅本地回环，供 AI/脚本驱动测试，见 [`MOCK_CONTROL_PORT`]）。
//! 生成器与控制指令断产生的事件经 broadcast 总线分发到已连接客户端。

use super::protocol::{make_packet, OP_AUTH_REPLY, OP_HEARTBEAT_REPLY, OP_SEND_MSG};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;
use tokio::sync::Mutex as TokioMutex;
use tokio_tungstenite::tungstenite::Message;

/// 保留房间号：进入此房间 = 连接本地虚拟直播间
pub const MOCK_ROOM_ID: u64 = 0;
/// 本地弹幕 WS 端口
pub const MOCK_WS_PORT: u16 = 23330;
/// 本地 HTTP 控制端口（curl 驱动测试，仅绑定 127.0.0.1）
pub const MOCK_CONTROL_PORT: u16 = 23331;

/// 模拟配置：控制面与事件生成器共享
#[derive(Debug, Clone)]
pub struct MockState {
    /// 主播是否开播；下播后生成器暂停普通事件
    pub live: bool,
    /// 弹幕间隔（毫秒），越小越接近洪峰
    pub danmaku_interval_ms: u64,
    /// 礼物类（礼物/SC/舰长轮换）间隔（毫秒），0 = 不发
    pub gift_interval_ms: u64,
    /// 每条消息注入的额外延迟（毫秒），模拟网络抖动
    pub delay_ms: u64,
    /// 踢线标记：连接处理发现为 true 时发 Close 帧并复位，演练断线重连
    pub kick: bool,
}

impl Default for MockState {
    fn default() -> Self {
        Self {
            live: true,
            danmaku_interval_ms: 1000,
            gift_interval_ms: 8000,
            delay_ms: 0,
            kick: false,
        }
    }
}

static MOCK_STATE: OnceLock<Arc<StdMutex<MockState>>> = OnceLock::new();
static MOCK_LIVE_START: OnceLock<u64> = OnceLock::new();
static SEQ: AtomicU64 = AtomicU64::new(1);

/// mock 启动时刻（unix 秒），充当虚拟直播间的"开播时间"
pub fn mock_live_start() -> u64 {
    *MOCK_LIVE_START.get_or_init(super::unix_secs)
}

pub fn state() -> Arc<StdMutex<MockState>> {
    MOCK_STATE
        .get_or_init(|| Arc::new(StdMutex::new(MockState::default())))
        .clone()
}

/// 是否启用虚拟直播间：环境变量 `BILIDANMU_MOCK` 存在且不为 "0"
pub fn is_enabled() -> bool {
    match std::env::var("BILIDANMU_MOCK") {
        Ok(value) => value != "0",
        Err(_) => false,
    }
}

fn bus() -> &'static broadcast::Sender<Value> {
    static BUS: OnceLock<broadcast::Sender<Value>> = OnceLock::new();
    // 容量对齐 TCP 语义：洪峰（如 1 万条压测）全量缓冲，由消费端按自身速度消化，
    // 而不是在缓冲满后丢弃（Lagged）。真实场景中 TCP 缓冲同样不丢消息。
    BUS.get_or_init(|| broadcast::channel(20 * 1024).0)
}

fn publish(command: Value) {
    let _ = bus().send(command);
}

fn unix_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// 启动 WS 服务器、事件生成器与 HTTP 控制面（仅 [`is_enabled`] 时由 lib.rs 调用一次）
pub fn spawn() {
    mock_live_start();
    let state = state();

    tauri::async_runtime::spawn(run_generator(state.clone()));
    tauri::async_runtime::spawn(run_control_server(state.clone()));

    tauri::async_runtime::spawn(async move {
        let addr = format!("127.0.0.1:{MOCK_WS_PORT}");
        match TcpListener::bind(&addr).await {
            Ok(listener) => {
                log::info!(
                    "[mock] 虚拟直播间已启用：ws://{addr}（房间号 {MOCK_ROOM_ID}），控制面 http://127.0.0.1:{MOCK_CONTROL_PORT}"
                );
                loop {
                    match listener.accept().await {
                        Ok((stream, _)) => {
                            log::info!("[mock] 客户端已接入");
                            let state = state.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(error) = serve_connection(stream, state).await {
                                    log::info!("[mock] 连接结束：{error}");
                                }
                            });
                        }
                        Err(error) => {
                            log::warn!("[mock] accept 失败：{error}");
                            tokio::time::sleep(Duration::from_secs(1)).await;
                        }
                    }
                }
            }
            Err(error) => log::error!("[mock] 端口 {addr} 绑定失败，虚拟直播间不可用：{error}"),
        }
    });
}

// ───────────────────────── 事件构造 ─────────────────────────

fn live_command() -> Value {
    json!({ "cmd": "LIVE", "roomid": MOCK_ROOM_ID, "live_time": super::unix_secs() })
}

fn preparing_command() -> Value {
    json!({ "cmd": "PREPARING", "roomid": MOCK_ROOM_ID, "send_time": unix_millis() })
}

fn online_count_command() -> Value {
    let seq = SEQ.load(Ordering::Relaxed);
    json!({
        "cmd": "ONLINE_RANK_COUNT",
        "data": { "online_count": 120 + (seq % 60) },
    })
}

fn mock_user(seq: u64) -> (u64, &'static str) {
    const USERS: [&str; 5] = ["测试用户A", "测试用户B", "测试用户C", "测试用户D", "测试用户E"];
    (1000 + (seq % 5), USERS[(seq as usize) % USERS.len()])
}

fn mock_medal() -> Value {
    json!({ "medal_name": "测试团", "medal_level": 5, "is_lighted": 1, "guard_level": 0 })
}

fn danmaku_command(username: Option<&str>, content: Option<&str>) -> Value {
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    const CONTENTS: [&str; 5] = [
        "这是一条测试弹幕",
        "虚拟直播间万岁",
        "哈哈哈",
        "主播好厉害",
        "666666",
    ];
    let (default_uid, default_name) = mock_user(seq);
    let content = content.unwrap_or(CONTENTS[(seq as usize) % CONTENTS.len()]);
    json!({
        "cmd": "DANMU_MSG",
        "info": [
            [0, 1, 25, 16_777_215, super::unix_secs(), format!("mock-{seq}"), 0, "", "", "", 0, "", "", 0],
            content,
            [default_uid, username.unwrap_or(default_name), "", 0, 0, 0, 0, 0, 0],
        ],
    })
}

fn gift_command(name: &str, uid: u64, seq: u64) -> Value {
    json!({
        "cmd": "SEND_GIFT",
        "data": {
            "uname": name,
            "uid": uid,
            "face": "",
            "giftName": if seq % 2 == 0 { "小花花" } else { "辣条" },
            "num": 1 + (seq % 3),
            "action": "送出",
            "timestamp": super::unix_secs(),
            "rnd": format!("mock-gift-{seq}"),
            "price": 100,
            "guard_level": 0,
            "medal_info": mock_medal(),
        },
    })
}

fn sc_command(name: &str, uid: u64, seq: u64, content: Option<&str>) -> Value {
    json!({
        "cmd": "SUPER_CHAT_MESSAGE",
        "data": {
            "id": seq,
            "uid": uid,
            "price": 30,
            "message": content.unwrap_or("这是醒目留言测试内容"),
            "start_time": super::unix_secs(),
            "user_info": { "uname": name, "face": "" },
            "gift": { "gift_name": "醒目留言", "num": 1 },
            "medal_info": mock_medal(),
            "background_color": "#EDF5FF",
            "background_bottom_color": "#2A60B2",
            "background_price_color": "#7497CD",
            "message_font_color": "#FFFFFF",
            "background_image": "",
        },
    })
}

fn guard_command(name: &str, uid: u64, _seq: u64) -> Value {
    json!({
        "cmd": "GUARD_BUY",
        "data": {
            "username": name,
            "uid": uid,
            "guard_level": 3,
            "gift_name": "舰长",
            "num": 1,
            "price": 138_000,
            "start_time": super::unix_secs(),
            "end_time": super::unix_secs(),
        },
    })
}

/// 礼物族轮换：seq 决定类型（2=SC 4=舰长，其余礼物）
fn gift_family_command(username: Option<&str>) -> Value {
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let (uid, default_name) = mock_user(seq);
    let name = username.unwrap_or(default_name);
    match seq % 5 {
        2 => sc_command(name, uid, seq, None),
        4 => guard_command(name, uid, seq),
        _ => gift_command(name, uid, seq),
    }
}

fn entry_command(username: Option<&str>) -> Value {
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let (default_uid, default_name) = mock_user(seq);
    let name = username.unwrap_or(default_name);
    let msg_type = 1 + (seq % 3); // 1 进场 / 2 关注 / 3 分享
    json!({
        "cmd": "INTERACT_WORD",
        "data": {
            "uid": default_uid,
            "uname": name,
            "timestamp": super::unix_secs(),
            "msg_type": msg_type,
            "uinfo": { "uid": default_uid, "base": { "name": name, "face": "" } },
            "fans_medal": mock_medal(),
        },
    })
}

fn like_command(username: Option<&str>) -> Value {
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let (default_uid, default_name) = mock_user(seq);
    json!({
        "cmd": "LIKE_INFO_V3_CLICK",
        "data": {
            "uid": default_uid,
            "uname": username.unwrap_or(default_name),
            "timestamp": super::unix_secs(),
            "click_time": 1 + (seq % 3),
            "like_text": "赞",
            "fans_medal": mock_medal(),
        },
    })
}

/// 手动注入单条事件（控制面 /event 用），类型由 kind 显式指定
fn manual_command(kind: &str, username: Option<&str>, content: Option<&str>) -> Option<Value> {
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let (uid, default_name) = mock_user(seq);
    let name = username.unwrap_or(default_name);
    match kind {
        "danmaku" => Some(danmaku_command(username, content)),
        "gift" => Some(gift_command(name, uid, seq)),
        "superChat" => Some(sc_command(name, uid, seq, content)),
        "guard" => Some(guard_command(name, uid, seq)),
        "entry" => Some(entry_command(username)),
        "like" => Some(like_command(username)),
        "live" => Some(live_command()),
        "preparing" => Some(preparing_command()),
        _ => None,
    }
}

// ───────────────────────── 事件生成器 ─────────────────────────

async fn run_generator(state: Arc<StdMutex<MockState>>) {
    let mut last_danmaku = Instant::now();
    let mut last_gift = Instant::now();
    let mut last_entry = Instant::now();
    let mut last_like = Instant::now();
    let mut tick: u64 = 0;

    loop {
        tokio::time::sleep(Duration::from_millis(100)).await;
        tick += 1;

        // 每 10 秒一条在线人数（不受开播状态影响，便于测试）
        if tick % 100 == 0 {
            publish(online_count_command());
        }

        let (live, danmaku_interval, gift_interval) = {
            let state = state.lock().expect("mock state poisoned");
            (state.live, state.danmaku_interval_ms, state.gift_interval_ms)
        };

        if !live {
            continue;
        }

        let now = Instant::now();
        if danmaku_interval > 0 && now >= last_danmaku + Duration::from_millis(danmaku_interval) {
            last_danmaku = now;
            publish(danmaku_command(None, None));
        }
        if gift_interval > 0 && now >= last_gift + Duration::from_millis(gift_interval) {
            last_gift = now;
            publish(gift_family_command(None));
        }
        if now >= last_entry + Duration::from_secs(12) {
            last_entry = now;
            publish(entry_command(None));
        }
        if now >= last_like + Duration::from_secs(7) {
            last_like = now;
            publish(like_command(None));
        }
    }
}

// ───────────────────────── 弹幕 WS 服务器 ─────────────────────────

async fn serve_connection(
    stream: TcpStream,
    state: Arc<StdMutex<MockState>>,
) -> Result<(), String> {
    let ws = tokio_tungstenite::accept_async(stream)
        .await
        .map_err(|error| error.to_string())?;
    let (writer, mut reader) = ws.split();
    let writer = Arc::new(TokioMutex::new(writer));
    let mut rx = bus().subscribe();

    let mut authenticated = false;
    loop {
        tokio::select! {
            frame = reader.next() => match frame {
                Some(Ok(message)) => {
                    let Some(op) = incoming_op(&message) else {
                        continue;
                    };
                    let reply = match op {
                        super::protocol::OP_AUTH => {
                            make_packet(br#"{"code":0}"#, OP_AUTH_REPLY).map_err(|error| error.to_string())?
                        }
                        super::protocol::OP_HEARTBEAT => {
                            // 人气值固定 233
                            make_packet(&233u32.to_be_bytes(), OP_HEARTBEAT_REPLY)
                                .map_err(|error| error.to_string())?
                        }
                        _ => continue,
                    };
                    writer
                        .lock()
                        .await
                        .send(Message::Binary(reply.into()))
                        .await
                        .map_err(|error| error.to_string())?;

                    // 认证通过后，定向补发当前开播态作为场次起点。
                    // 必须走直发而非总线：若经总线，补发命令可能抢在认证回包前
                    // 到达客户端，被当成首帧导致认证失败。
                    if op == super::protocol::OP_AUTH && !authenticated {
                        authenticated = true;
                        let live = state.lock().expect("mock state poisoned").live;
                        let snapshot = if live { live_command() } else { preparing_command() };
                        let bytes = send_msg_packet(&snapshot)?;
                        writer
                            .lock()
                            .await
                            .send(Message::Binary(bytes.into()))
                            .await
                            .map_err(|error| error.to_string())?;
                    }
                }
                Some(Err(error)) => return Err(error.to_string()),
                None => return Err("客户端已断开".to_string()),
            },
            command = rx.recv() => match command {
                Ok(command) => {
                    if let Some(delay) = current_delay(&state) {
                        tokio::time::sleep(delay).await;
                    }
                    let bytes = send_msg_packet(&command)?;
                    writer
                        .lock()
                        .await
                        .send(Message::Binary(bytes.into()))
                        .await
                        .map_err(|error| error.to_string())?;
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => {
                    return Err("事件总线已关闭".to_string())
                }
            },
            // 定期检查踢线标记
            _ = tokio::time::sleep(Duration::from_millis(200)) => {
                let kicked = state
                    .lock()
                    .map(|mut state| {
                        let kick = state.kick;
                        if kick {
                            state.kick = false; // 复位，避免后续连接被误杀
                        }
                        kick
                    })
                    .unwrap_or(false);
                if kicked {
                    let mut writer = writer.lock().await;
                    let _ = writer.send(Message::Close(None)).await;
                    return Err("已按控制指令断开（踢线演练）".to_string());
                }
            }
        }
    }
}

fn current_delay(state: &Arc<StdMutex<MockState>>) -> Option<Duration> {
    let state = state.lock().expect("mock state poisoned");
    (state.delay_ms > 0).then(|| Duration::from_millis(state.delay_ms))
}

/// 解析客户端帧的 operation（B 站包头 16 字节，op 在 [8..12)）
fn incoming_op(message: &Message) -> Option<u32> {
    match message {
        Message::Binary(bytes) if bytes.len() >= 12 => {
            Some(u32::from_be_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]))
        }
        _ => None,
    }
}

fn send_msg_packet(command: &Value) -> Result<Vec<u8>, String> {
    let body = serde_json::to_vec(command).map_err(|error| error.to_string())?;
    make_packet(&body, OP_SEND_MSG).map_err(|error| error.to_string())
}

// ───────────────────────── HTTP 控制面 ─────────────────────────

async fn run_control_server(state: Arc<StdMutex<MockState>>) {
    let addr = format!("127.0.0.1:{MOCK_CONTROL_PORT}");
    match TcpListener::bind(&addr).await {
        Ok(listener) => loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let state = state.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) = handle_control(stream, state).await {
                            log::debug!("[mock] 控制请求处理结束：{error}");
                        }
                    });
                }
                Err(_) => tokio::time::sleep(Duration::from_secs(1)).await,
            }
        },
        Err(error) => log::error!("[mock] 控制面端口 {addr} 绑定失败：{error}"),
    }
}

async fn handle_control(stream: TcpStream, state: Arc<StdMutex<MockState>>) -> Result<(), String> {
    let (reader, mut writer) = stream.into_split();
    let mut reader = BufReader::new(reader);

    // 请求行 + 头部
    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .await
        .map_err(|error| error.to_string())?;
    let mut content_length = 0usize;
    loop {
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .await
            .map_err(|error| error.to_string())?;
        if line == "\r\n" || line == "\n" || line.is_empty() {
            break;
        }
        if let Some(value) = line
            .to_ascii_lowercase()
            .strip_prefix("content-length:")
            .map(|value| value.trim().to_string())
        {
            content_length = value.parse().unwrap_or(0);
        }
    }

    let mut body = vec![0u8; content_length.min(64 * 1024)];
    if !body.is_empty() {
        reader
            .read_exact(&mut body)
            .await
            .map_err(|error| error.to_string())?;
    }

    let path = request_line
        .split_whitespace()
        .nth(1)
        .unwrap_or("/")
        .to_string();
    let payload: Value = if body.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&body).unwrap_or(Value::Null)
    };

    let response = apply_control(&state, &path, &payload).await;
    let text = serde_json::to_string(&response).unwrap_or_else(|_| "{}".to_string());
    writer
        .write_all(
            format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}",
                text.len()
            )
            .as_bytes(),
        )
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

async fn apply_control(state: &Arc<StdMutex<MockState>>, path: &str, payload: &Value) -> Value {
    fn get_u64(payload: &Value, key: &str) -> Option<u64> {
        payload.get(key).and_then(Value::as_u64)
    }
    fn get_str<'a>(payload: &'a Value, key: &str) -> Option<&'a str> {
        payload.get(key).and_then(Value::as_str)
    }

    match path {
        "/status" => {
            let state = state.lock().expect("mock state poisoned");
            json!({
                "live": state.live,
                "danmakuIntervalMs": state.danmaku_interval_ms,
                "giftIntervalMs": state.gift_interval_ms,
                "delayMs": state.delay_ms,
            })
        }
        "/config" => {
            let mut state = state.lock().expect("mock state poisoned");
            if let Some(value) = get_u64(payload, "danmakuIntervalMs") {
                state.danmaku_interval_ms = value;
            }
            if let Some(value) = get_u64(payload, "giftIntervalMs") {
                state.gift_interval_ms = value;
            }
            if let Some(value) = get_u64(payload, "delayMs") {
                state.delay_ms = value;
            }
            json!({
                "ok": true,
                "live": state.live,
                "danmakuIntervalMs": state.danmaku_interval_ms,
                "giftIntervalMs": state.gift_interval_ms,
                "delayMs": state.delay_ms,
            })
        }
        "/live" => {
            state.lock().expect("mock state poisoned").live = true;
            publish(live_command());
            json!({ "ok": true, "live": true })
        }
        "/preparing" => {
            state.lock().expect("mock state poisoned").live = false;
            publish(preparing_command());
            json!({ "ok": true, "live": false })
        }
        "/kick" => {
            state.lock().expect("mock state poisoned").kick = true;
            json!({ "ok": true })
        }
        "/event" => {
            let kind = get_str(payload, "type").unwrap_or("danmaku");
            match manual_command(kind, get_str(payload, "username"), get_str(payload, "content")) {
                Some(command) => {
                    publish(command);
                    json!({ "ok": true, "type": kind })
                }
                None => json!({ "ok": false, "error": "未知事件类型" }),
            }
        }
        "/burst" => {
            let count = get_u64(payload, "count").unwrap_or(100).min(5000);
            let interval = get_u64(payload, "intervalMs").unwrap_or(10).max(1);
            tauri::async_runtime::spawn(async move {
                for _ in 0..count {
                    publish(danmaku_command(None, None));
                    tokio::time::sleep(Duration::from_millis(interval)).await;
                }
            });
            json!({ "ok": true, "count": count, "intervalMs": interval })
        }
        _ => json!({ "ok": false, "error": "未知路径，可用：/status /config /live /preparing /kick /event /burst" }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bili::protocol::{auth_packet, decode_packets, heartbeat_packet, ParsedPacket};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    /// 端到端：认证回包 → 开播态快照 → 生成器弹幕 → 控制面 /preparing → /kick 踢线
    #[tokio::test]
    async fn mock_server_end_to_end() {
        std::env::set_var("BILIDANMU_MOCK", "1");
        spawn();
        // 等待 WS 端口就绪
        let mut ws = None;
        for _ in 0..50 {
            match tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{MOCK_WS_PORT}/sub")).await {
                Ok((stream, _)) => {
                    ws = Some(stream);
                    break;
                }
                Err(_) => tokio::time::sleep(Duration::from_millis(100)).await,
            }
        }
        let ws = ws.expect("mock ws 服务器未就绪");
        let (mut writer, mut reader) = ws.split();

        // 1) 认证：首帧必须是 AuthReply(code=0)
        writer
            .send(Message::Binary(
                auth_packet(MOCK_ROOM_ID, 0, "test-buvid", "mock").unwrap().into(),
            ))
            .await
            .unwrap();
        let frame = tokio::time::timeout(Duration::from_secs(3), reader.next())
            .await
            .expect("认证回包超时")
            .unwrap()
            .unwrap();
        let Message::Binary(bytes) = frame else {
            panic!("认证回包不是二进制帧");
        };
        let packets = decode_packets(&bytes).unwrap();
        assert!(packets.iter().any(|packet| matches!(
            packet,
            ParsedPacket::AuthReply(value) if value["code"] == 0
        )));

        // 2) 第二帧应为开播态快照（LIVE 或 PREPARING）
        let frame = tokio::time::timeout(Duration::from_secs(3), reader.next())
            .await
            .expect("开播态快照超时")
            .unwrap()
            .unwrap();
        let Message::Binary(bytes) = frame else {
            panic!("快照不是二进制帧");
        };
        let packets = decode_packets(&bytes).unwrap();
        assert!(packets.iter().any(|packet| matches!(
            packet,
            ParsedPacket::Command(value) if value["cmd"] == "LIVE" || value["cmd"] == "PREPARING"
        )));

        // 3) 心跳回包：人气值 233
        writer
            .send(Message::Binary(heartbeat_packet().unwrap().into()))
            .await
            .unwrap();
        let mut heartbeat_ok = false;
        for _ in 0..10 {
            let frame = tokio::time::timeout(Duration::from_secs(2), reader.next())
                .await
                .expect("心跳回包超时")
                .unwrap()
                .unwrap();
            let Message::Binary(bytes) = frame else {
                continue;
            };
            if decode_packets(&bytes).unwrap().iter().any(|packet| {
                matches!(packet, ParsedPacket::HeartbeatReply(popularity) if *popularity == 233)
            }) {
                heartbeat_ok = true;
                break;
            }
        }
        assert!(heartbeat_ok, "未收到人气值 233 的心跳回包");

        // 4) 生成器应持续产出弹幕（默认 1 秒间隔）
        let mut got_danmaku = false;
        for _ in 0..10 {
            let frame = tokio::time::timeout(Duration::from_secs(2), reader.next())
                .await
                .expect("生成器弹幕超时")
                .unwrap()
                .unwrap();
            let Message::Binary(bytes) = frame else {
                continue;
            };
            if decode_packets(&bytes).unwrap().iter().any(|packet| {
                matches!(packet, ParsedPacket::Command(value) if value["cmd"].as_str().unwrap_or_default().starts_with("DANMU_MSG"))
            }) {
                got_danmaku = true;
                break;
            }
        }
        assert!(got_danmaku, "未收到生成器弹幕");

        // 5) 控制面 /preparing → 随后应收到 PREPARING 命令
        let (control_read, mut control_write) =
            tokio::net::TcpStream::connect(format!("127.0.0.1:{MOCK_CONTROL_PORT}"))
                .await
                .expect("控制面未就绪")
                .into_split();
        control_write
            .write_all(b"POST /preparing HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .await
            .unwrap();
        let mut response = String::new();
        let mut buf_reader = tokio::io::BufReader::new(control_read);
        tokio::time::timeout(Duration::from_secs(3), buf_reader.read_to_string(&mut response))
            .await
            .expect("控制面响应超时")
            .unwrap();
        assert!(response.contains("\"ok\":true"), "控制面响应异常：{response}");

        let mut got_preparing = false;
        for _ in 0..10 {
            let frame = tokio::time::timeout(Duration::from_secs(2), reader.next())
                .await
                .expect("PREPARING 超时")
                .unwrap()
                .unwrap();
            let Message::Binary(bytes) = frame else {
                continue;
            };
            if decode_packets(&bytes).unwrap().iter().any(|packet| {
                matches!(packet, ParsedPacket::Command(value) if value["cmd"] == "PREPARING")
            }) {
                got_preparing = true;
                break;
            }
        }
        assert!(got_preparing, "未收到控制面触发的 PREPARING");

        // 6) /kick → 连接被服务端关闭
        let (_, mut control) = tokio::net::TcpStream::connect(format!("127.0.0.1:{MOCK_CONTROL_PORT}"))
            .await
            .unwrap()
            .into_split();
        control
            .write_all(b"POST /kick HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .await
            .unwrap();
        let kicked = tokio::time::timeout(Duration::from_secs(3), reader.next()).await;
        assert!(kicked.is_ok(), "踢线后未收到断开");
    }
}
