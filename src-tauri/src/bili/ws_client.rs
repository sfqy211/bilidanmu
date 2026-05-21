use crate::bili::api::BiliApiClient;
use crate::bili::protocol::{auth_packet, decode_packets, heartbeat_packet, parse_danmaku_command, ParsedPacket};
use crate::bili::credential::BiliCredential;
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, Mutex};
use tokio::time::{sleep, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};

pub struct DanmakuWsClient {
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl DanmakuWsClient {
    pub fn new() -> Self {
        Self { shutdown_tx: None }
    }

    pub async fn connect(
        &mut self,
        app: AppHandle,
        api: BiliApiClient,
        room_id: u64,
        credential: Option<BiliCredential>,
    ) -> Result<(), String> {
        self.disconnect().await;

        let (shutdown_tx, mut shutdown_rx) = oneshot::channel();
        self.shutdown_tx = Some(shutdown_tx);

        let app_handle = app.clone();
        tokio::spawn(async move {
            let backoffs = [5u64, 10, 30, 60];
            let mut attempt = 0usize;

            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => {
                        let _ = app_handle.emit("ws-disconnected", serde_json::json!({"reason": "manual"}));
                        break;
                    }
                    result = run_connection(app_handle.clone(), api.clone(), room_id, credential.clone()) => {
                        match result {
                            Ok(()) => break,
                            Err(error) => {
                                let _ = app_handle.emit("danmaku-error", serde_json::json!({"message": error}));
                                let wait_sec = backoffs[attempt.min(backoffs.len() - 1)];
                                attempt = attempt.saturating_add(1);
                                sleep(Duration::from_secs(wait_sec)).await;
                            }
                        }
                    }
                }
            }
        });

        Ok(())
    }

    pub async fn disconnect(&mut self) {
        if let Some(shutdown_tx) = self.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }
    }
}

async fn run_connection(
    app: AppHandle,
    api: BiliApiClient,
    room_id: u64,
    credential: Option<BiliCredential>,
) -> Result<(), String> {
    let danmu_info = api.get_danmu_info(room_id).await?;
    let data = danmu_info
        .get("data")
        .ok_or_else(|| "弹幕信息缺少 data 字段".to_string())?;
    let token = data
        .get("token")
        .and_then(Value::as_str)
        .ok_or_else(|| "弹幕信息缺少 token".to_string())?;
    let host = data
        .get("host_list")
        .and_then(Value::as_array)
        .and_then(|list| list.first())
        .and_then(Value::as_object)
        .ok_or_else(|| "弹幕信息缺少 host_list".to_string())?;
    let ws_host = host
        .get("host")
        .and_then(Value::as_str)
        .ok_or_else(|| "host_list 缺少 host".to_string())?;
    let wss_port = host
        .get("wss_port")
        .and_then(Value::as_u64)
        .unwrap_or(443);

    let url = format!("wss://{ws_host}:{wss_port}/sub");
    let (stream, _) = connect_async(&url).await.map_err(|error| error.to_string())?;
    let (mut writer, mut reader) = stream.split();

    let uid = credential
        .as_ref()
        .and_then(|value| value.dede_user_id.as_deref())
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let buvid = credential
        .as_ref()
        .and_then(|value| value.buvid3.as_deref())
        .unwrap_or("buvid-missing");

    writer
        .send(Message::Binary(auth_packet(room_id, uid, buvid, token)?.into()))
        .await
        .map_err(|error| error.to_string())?;

    let auth_frame = reader
        .next()
        .await
        .ok_or_else(|| "未收到认证回复".to_string())?
        .map_err(|error| error.to_string())?;

    let auth_bytes = match auth_frame {
        Message::Binary(bytes) => bytes,
        _ => return Err("认证回复不是二进制消息".to_string()),
    };

    let packets = decode_packets(&auth_bytes)?;
    let auth_ok = packets.iter().any(|packet| match packet {
        ParsedPacket::AuthReply(payload) => payload.get("code").and_then(Value::as_i64) == Some(0),
        _ => false,
    });

    if !auth_ok {
        return Err("弹幕认证失败".to_string());
    }

    let _ = app.emit("ws-connected", serde_json::json!({"roomId": room_id}));
    writer
        .send(Message::Binary(heartbeat_packet()?.into()))
        .await
        .map_err(|error| error.to_string())?;

    let writer = Arc::new(Mutex::new(writer));
    let heartbeat_writer = writer.clone();
    let heartbeat_task = tokio::spawn(async move {
        loop {
            sleep(Duration::from_secs(30)).await;
            let Ok(packet) = heartbeat_packet() else {
                break;
            };
            let mut writer = heartbeat_writer.lock().await;
            if writer.send(Message::Binary(packet.into())).await.is_err() {
                break;
            }
        }
    });

    let result = async {
        while let Some(message) = reader.next().await {
            match message.map_err(|error| error.to_string())? {
                Message::Binary(bytes) => {
                    for packet in decode_packets(&bytes)? {
                        match packet {
                            ParsedPacket::Command(command) => {
                                let cmd = command
                                    .get("cmd")
                                    .and_then(Value::as_str)
                                    .unwrap_or("");

                                // LIKE_INFO_V3_UPDATE 单独处理，不交给 parse_danmaku_command
                                if cmd.starts_with("LIKE_INFO_V3_UPDATE") {
                                    if let Some(data) = command.get("data") {
                                        let click_count = data
                                            .get("click_count")
                                            .and_then(value_as_u64)
                                            .unwrap_or(0);
                                        let _ = app.emit(
                                            "like-count-update",
                                            serde_json::json!({
                                                "roomId": room_id,
                                                "clickCount": click_count,
                                            }),
                                        );
                                    }
                                } else if let Some(event) = parse_danmaku_command(&command, room_id) {
                                    let _ = app.emit("danmaku-received", &event);
                                }
                            }
                            ParsedPacket::HeartbeatReply(popularity) => {
                                let _ = app.emit("ws-heartbeat", serde_json::json!({"popularity": popularity}));
                            }
                            ParsedPacket::AuthReply(_) => {}
                        }
                    }
                }
                Message::Close(frame) => {
                    let reason = frame.map(|value| value.reason.to_string()).unwrap_or_else(|| "closed".to_string());
                    let _ = app.emit("ws-disconnected", serde_json::json!({"reason": reason}));
                    return Err("连接已关闭".to_string());
                }
                _ => {}
            }
        }

        let _ = app.emit("ws-disconnected", serde_json::json!({"reason": "socket ended"}));
        Err("WebSocket 连接结束".to_string())
    }
    .await;

    heartbeat_task.abort();

    match result {
        Ok(()) => Ok(()),
        Err(error) => Err(error),
    }
}

fn value_as_u64(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_i64().and_then(|number| u64::try_from(number).ok()))
        .or_else(|| value.as_str().and_then(|number| number.parse::<u64>().ok()))
}
