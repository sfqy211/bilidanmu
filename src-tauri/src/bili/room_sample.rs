//! 任意直播间弹幕短采样（仅 AI/MCP 使用，不接入 UI）。
//!
//! 客户端常驻的 WebSocket 只能连一个房间，`ai/context.rs` 的缓冲也只属于当前房间。
//! 这里给 AI 另开一条**一次性只读连接**：连上目标房间、采集若干秒、关闭。
//! 不切换当前直播间、不开窗口、不写上下文缓冲，也不占用发送队列。

use crate::bili::api::BiliApiClient;
use crate::bili::protocol::{
    auth_packet, decode_packets, heartbeat_packet, parse_danmaku_events, ParsedPacket,
};
use crate::models::message::DanmakuEvent;
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::time::{timeout, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// 认证回复的等待上限。
const AUTH_TIMEOUT_SECS: u64 = 10;

/// 已认证的弹幕 WebSocket 连接（短采样与长会话共用）。
pub type RoomSocket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

/// 连接目标房间并完成认证，返回可直接读写的 socket。
///
/// 只负责建连：不注册到 App、不切换当前直播间、不写上下文缓冲。
pub async fn connect_room_socket(
    api: &BiliApiClient,
    room_id: u64,
) -> Result<RoomSocket, String> {
    let (url, token) = if room_id == crate::bili::mock::MOCK_ROOM_ID && crate::bili::mock::is_enabled()
    {
        (
            format!("ws://127.0.0.1:{}/sub", crate::bili::mock::MOCK_WS_PORT),
            "mock".to_string(),
        )
    } else {
        let danmu_info = api.get_danmu_info(room_id).await?;
        let data = danmu_info
            .get("data")
            .ok_or_else(|| "弹幕信息缺少 data 字段".to_string())?;
        let token = data
            .get("token")
            .and_then(Value::as_str)
            .ok_or_else(|| "弹幕信息缺少 token".to_string())?
            .to_string();
        let hosts = data
            .get("host_list")
            .and_then(Value::as_array)
            .ok_or_else(|| "弹幕信息缺少 host_list".to_string())?;
        let host = crate::bili::ws_client::select_best_danmu_host(hosts)
            .await
            .ok_or_else(|| "host_list 中没有可用主机".to_string())?;
        let ws_host = host
            .get("host")
            .and_then(Value::as_str)
            .ok_or_else(|| "host_list 缺少 host".to_string())?;
        let wss_port = host
            .get("wss_port")
            .and_then(Value::as_u64)
            .unwrap_or(443);
        (format!("wss://{ws_host}:{wss_port}/sub"), token)
    };

    let (mut stream, _) = connect_async(&url)
        .await
        .map_err(|error| format!("连接弹幕服务器失败: {error}"))?;

    // 只读采集用当前账号身份即可（uid=0 为匿名），房管/舰长标识不影响弹幕内容
    let uid = api
        .credential
        .as_ref()
        .and_then(|credential| credential.dede_user_id.as_deref())
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let buvid = api
        .credential
        .as_ref()
        .and_then(|credential| credential.buvid3.as_deref())
        .unwrap_or("buvid-missing");

    stream
        .send(Message::Binary(
            auth_packet(room_id, uid, buvid, &token)?.into(),
        ))
        .await
        .map_err(|error| format!("发送弹幕认证失败: {error}"))?;

    let auth_frame = timeout(Duration::from_secs(AUTH_TIMEOUT_SECS), stream.next())
        .await
        .map_err(|_| "等待弹幕认证回复超时".to_string())?
        .ok_or_else(|| "连接在认证前关闭".to_string())?
        .map_err(|error| format!("读取弹幕认证回复失败: {error}"))?;
    let auth_bytes = match auth_frame {
        Message::Binary(bytes) => bytes,
        _ => return Err("弹幕认证回复不是二进制消息".to_string()),
    };
    let auth_ok = decode_packets(&auth_bytes)?.iter().any(|packet| match packet {
        ParsedPacket::AuthReply(payload) => payload.get("code").and_then(Value::as_i64) == Some(0),
        _ => false,
    });
    if !auth_ok {
        return Err("弹幕认证失败（房间可能未开播或房间号无效）".to_string());
    }

    Ok(stream)
}

/// 对任意直播间做一次短采样，返回其中的弹幕与醒目留言。
///
/// - `seconds`：采样时长（调用方已做范围限制）
/// - `max_events`：最多返回多少条，达到后提前结束
pub async fn sample_room_danmaku(
    api: &BiliApiClient,
    room_id: u64,
    seconds: u64,
    max_events: usize,
) -> Result<Vec<DanmakuEvent>, String> {
    let stream = connect_room_socket(api, room_id).await?;
    let (mut writer, mut reader) = stream.split();

    // 立即上报一次，之后采样窗口内每 30 秒补一次（长采样否则会被服务端判定掉线）
    writer
        .send(Message::Binary(heartbeat_packet()?.into()))
        .await
        .map_err(|error| format!("发送心跳失败: {error}"))?;
    let mut heartbeat = tokio::time::interval(Duration::from_secs(30));
    heartbeat.tick().await; // 消耗第一次立即触发的 tick（上面已发过）

    let deadline = tokio::time::Instant::now() + Duration::from_secs(seconds.max(1));
    let mut events: Vec<DanmakuEvent> = Vec::new();
    while events.len() < max_events {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }
        let next = tokio::select! {
            _ = heartbeat.tick() => {
                if writer.send(Message::Binary(heartbeat_packet()?.into())).await.is_err() {
                    break;
                }
                continue;
            }
            next = timeout(remaining, reader.next()) => match next {
                // 采样时间到：正常收尾
                Err(_) => break,
                Ok(None) => break,
                // 连接中断：保留已采到的消息，不向上报错
                Ok(Some(Err(_))) => break,
                Ok(Some(Ok(message))) => message,
            },
        };
        let Message::Binary(bytes) = next else {
            continue;
        };
        let packets = match decode_packets(&bytes) {
            Ok(packets) => packets,
            Err(_) => continue,
        };
        for packet in packets {
            let ParsedPacket::Command(command) = packet else {
                continue;
            };
            for event in parse_danmaku_events(&command, room_id) {
                // 只保留有信息量的文本事件；进场/点赞等轻量活动对总结无帮助
                if matches!(event.event_type.as_str(), "danmaku" | "super_chat") {
                    events.push(event);
                }
            }
        }
    }

    let _ = writer.close().await;
    events.truncate(max_events);
    Ok(events)
}
