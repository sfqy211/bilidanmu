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
    web_heartbeat_abort: Option<tokio::task::AbortHandle>,
    room_id: u64,
}

impl DanmakuWsClient {
    pub fn new() -> Self {
        Self {
            shutdown_tx: None,
            web_heartbeat_abort: None,
            room_id: 0,
        }
    }

    pub async fn connect(
        &mut self,
        app: AppHandle,
        api: BiliApiClient,
        room_id: u64,
        credential: Option<BiliCredential>,
    ) -> Result<(), String> {
        self.disconnect().await;
        self.room_id = room_id;

        let (shutdown_tx, mut shutdown_rx) = oneshot::channel();
        self.shutdown_tx = Some(shutdown_tx);

        let app_handle = app.clone();
        let connection_task = tokio::spawn(async move {
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

        self.web_heartbeat_abort = Some(connection_task.abort_handle());
        Ok(())
    }

    pub async fn disconnect(&mut self) {
        if self.web_heartbeat_abort.is_some() {
            log::info!("[heartbeat] 心跳任务已取消, room={}", self.room_id);
        }
        if let Some(abort) = self.web_heartbeat_abort.take() {
            abort.abort();
        }
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
    // 解析真实房间号和主播 UID，用于心跳上报
    let (real_room_id, up_id) = match api.get_room_info(room_id).await {
        Ok(info) => {
            let rid = info.room.room_id;
            let uid = info.room.uid.unwrap_or(0);
            if rid != room_id {
                log::info!("[ws] 短号 {room_id} → 真实房间号 {rid}");
            }
            (rid, uid)
        }
        Err(_) => (room_id, 0),
    };

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

    // 心跳上报（亲密度/观看时长）— 作为 future 运行，连接结束时自动停止
    let heartbeat_credential = credential.clone();
    let heartbeat_client = reqwest::Client::builder()
        .http1_only()
        .build()
        .unwrap_or_else(|_| api.client.clone());
    let heartbeat_fut = async move {
        let cred = match heartbeat_credential {
            Some(c) => c,
            None => return,
        };
        let session_uuid = uuid::Uuid::new_v4().to_string();
        let click_id = uuid::Uuid::new_v4().to_string();
        let access_key = cred.access_key.clone().unwrap_or_default();
        log::info!("[heartbeat] 心跳任务启动, room={real_room_id}, up={up_id}, has_access_key={}", !access_key.is_empty());
        let mut interval = 60u64;
        loop {
            interval = super::heartbeat::send_heartbeat(
                &heartbeat_client,
                &cred,
                real_room_id,
                up_id,
                interval,
                &session_uuid,
                &click_id,
                &access_key,
            )
            .await;
            sleep(Duration::from_secs(interval)).await;
        }
    };

    let result = tokio::select! {
        _ = heartbeat_fut => {
            Err("心跳任务结束".to_string())
        }
        msg_result = async {
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

                                // LIKE_INFO_V3_UPDATE / ONLINE_RANK_COUNT 单独处理
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
                                } else if cmd.starts_with("ONLINE_RANK_COUNT") {
                                    if let Some(data) = command.get("data") {
                                        let online_count = data
                                            .get("online_count")
                                            .and_then(value_as_u64)
                                            .unwrap_or(0);
                                        let _ = app.emit(
                                            "online-count-update",
                                            serde_json::json!({
                                                "roomId": room_id,
                                                "onlineCount": online_count,
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
    } => msg_result
    };

    log::info!("[heartbeat] 心跳任务结束, room={real_room_id}");
    heartbeat_task.abort();

    result
}

fn value_as_u64(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_i64().and_then(|number| u64::try_from(number).ok()))
        .or_else(|| value.as_str().and_then(|number| number.parse::<u64>().ok()))
}
