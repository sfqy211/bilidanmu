use crate::models::message::DanmakuEvent;
use brotli::Decompressor;
use flate2::read::ZlibDecoder;
use serde_json::Value;
use std::io::Read;

pub const HEADER_SIZE: usize = 16;
pub const OP_HEARTBEAT: u32 = 2;
pub const OP_HEARTBEAT_REPLY: u32 = 3;
pub const OP_SEND_MSG: u32 = 5;
pub const OP_AUTH: u32 = 7;
pub const OP_AUTH_REPLY: u32 = 8;

#[derive(Debug, Clone, Copy)]
pub struct PacketHeader {
    pub pack_len: u32,
    pub header_size: u16,
    pub ver: u16,
    pub operation: u32,
    #[allow(dead_code)]
    pub seq_id: u32,
}

impl PacketHeader {
    pub fn from_bytes(data: &[u8]) -> Result<Self, String> {
        if data.len() < HEADER_SIZE {
            return Err("数据长度不足，无法解析包头".to_string());
        }

        Ok(Self {
            pack_len: u32::from_be_bytes(data[0..4].try_into().map_err(|_| "pack_len 解析失败")?),
            header_size: u16::from_be_bytes(data[4..6].try_into().map_err(|_| "header_size 解析失败")?),
            ver: u16::from_be_bytes(data[6..8].try_into().map_err(|_| "ver 解析失败")?),
            operation: u32::from_be_bytes(data[8..12].try_into().map_err(|_| "operation 解析失败")?),
            seq_id: u32::from_be_bytes(data[12..16].try_into().map_err(|_| "seq_id 解析失败")?),
        })
    }
}

#[derive(Debug, Clone)]
pub enum ParsedPacket {
    AuthReply(Value),
    HeartbeatReply(u32),
    Command(Value),
}

pub fn auth_packet(room_id: u64, uid: u64, buvid: &str, key: &str) -> Result<Vec<u8>, String> {
    let body = serde_json::to_vec(&serde_json::json!({
        "uid": uid,
        "roomid": room_id,
        "protover": 3,
        "platform": "web",
        "type": 2,
        "buvid": buvid,
        "key": key,
    }))
    .map_err(|error| error.to_string())?;

    make_packet(&body, OP_AUTH)
}

pub fn heartbeat_packet() -> Result<Vec<u8>, String> {
    make_packet(b"[object Object]", OP_HEARTBEAT)
}

pub fn decode_packets(data: &[u8]) -> Result<Vec<ParsedPacket>, String> {
    let mut offset = 0usize;
    let mut packets = Vec::new();

    while offset + HEADER_SIZE <= data.len() {
        let header = PacketHeader::from_bytes(&data[offset..offset + HEADER_SIZE])?;
        let packet_len = header.pack_len as usize;
        if packet_len == 0 || offset + packet_len > data.len() {
            break;
        }

        let body_start = offset + header.header_size as usize;
        let body = &data[body_start..offset + packet_len];

        match header.operation {
            OP_HEARTBEAT_REPLY => {
                let popularity = body
                    .get(0..4)
                    .and_then(|chunk| chunk.try_into().ok())
                    .map(u32::from_be_bytes)
                    .unwrap_or_default();
                packets.push(ParsedPacket::HeartbeatReply(popularity));
            }
            OP_AUTH_REPLY => {
                let payload = serde_json::from_slice::<Value>(body).map_err(|error| error.to_string())?;
                packets.push(ParsedPacket::AuthReply(payload));
            }
            OP_SEND_MSG => match header.ver {
                3 => {
                    let decompressed = decompress_brotli(body)?;
                    packets.extend(decode_packets(&decompressed)?);
                }
                2 => {
                    let decompressed = decompress_zlib(body)?;
                    packets.extend(decode_packets(&decompressed)?);
                }
                _ => {
                    let payload = serde_json::from_slice::<Value>(body).map_err(|error| error.to_string())?;
                    packets.push(ParsedPacket::Command(payload));
                }
            },
            _ => {}
        }

        offset += packet_len;
    }

    Ok(packets)
}

pub fn parse_danmaku_command(command: &Value, room_id: u64) -> Option<DanmakuEvent> {
    let cmd = command.get("cmd")?.as_str()?;

    if cmd.starts_with("DANMU_MSG") {
        return parse_text_danmaku(command, room_id);
    }

    if cmd == "SEND_GIFT" {
        return parse_gift_message(command, room_id);
    }

    if cmd == "INTERACT_WORD" {
        return parse_interact_word(command, room_id);
    }

    if cmd == "SUPER_CHAT_MESSAGE" {
        return parse_super_chat(command, room_id);
    }

    None
}

fn parse_text_danmaku(command: &Value, room_id: u64) -> Option<DanmakuEvent> {
    let info = command.get("info")?.as_array()?;
    let content = info.get(1)?.as_str()?.to_string();
    let user_info = info.get(2)?.as_array()?;
    let uid = user_info.first().and_then(value_as_u64).unwrap_or(0);
    let username = user_info.get(1)?.as_str()?.to_string();
    let basic = info.first()?.as_array()?;
    let timestamp = basic.get(4).and_then(value_as_u64).unwrap_or(0);
    let id = basic.get(5).and_then(value_as_u64).unwrap_or(timestamp).to_string();
    let color = basic.get(3).and_then(value_as_u64).unwrap_or(16_777_215) as u32;
    let dm_type = basic.get(12).and_then(value_as_u64).unwrap_or(0) as u8;
    let is_admin = user_info.get(2).and_then(value_as_u64).unwrap_or(0) == 1;
    let guard_level = info.get(7).and_then(value_as_u64).unwrap_or(0) as u8;
    let medal = parse_array_medal(info.get(3));
    let emots = basic
        .get(15)
        .and_then(|value| value.get("extra"))
        .and_then(Value::as_str)
        .and_then(|value| serde_json::from_str::<Value>(value).ok())
        .and_then(|value| value.get("emots").cloned())
        .filter(Value::is_object);
    let emoticon_options = basic.get(13).and_then(|value| {
        if value.is_object() {
            Some(value.clone())
        } else {
            value
                .as_str()
                .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
                .filter(Value::is_object)
        }
    });

    let avatar = basic
        .get(15)
        .and_then(Value::as_object)
        .and_then(|mode_info| mode_info.get("user"))
        .and_then(Value::as_object)
        .and_then(|user| user.get("base"))
        .and_then(Value::as_object)
        .and_then(|base| base.get("face"))
        .and_then(Value::as_str)
        .map(ToString::to_string);

    Some(DanmakuEvent {
        id,
        room_id,
        event_type: "danmaku".to_string(),
        username,
        content,
        timestamp,
        avatar,
        medal,
        uid,
        color,
        guard_level,
        is_admin,
        dm_type,
        price: None,
        gift_name: None,
        count: None,
        background_color: None,
        background_bottom_color: None,
        background_price_color: None,
        message_font_color: None,
        background_image: None,
        emots,
        emoticon_options,
    })
}

fn parse_gift_message(command: &Value, room_id: u64) -> Option<DanmakuEvent> {
    let data = command.get("data")?;
    let username = data.get("uname")?.as_str()?.to_string();
    let uid = data.get("uid").and_then(value_as_u64).unwrap_or(0);
    let gift_name = data.get("giftName")?.as_str()?.to_string();
    let count = data.get("num").and_then(value_as_u64).unwrap_or(1) as u32;
    let action = data.get("action").and_then(Value::as_str).unwrap_or("送出");
    let timestamp = data.get("timestamp").and_then(value_as_u64).unwrap_or(0);
    let id = data
        .get("rnd")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .or_else(|| data.get("tid").and_then(Value::as_str).map(ToString::to_string))
        .unwrap_or_else(|| format!("gift-{room_id}-{uid}-{timestamp}"));

    Some(DanmakuEvent {
        id,
        room_id,
        event_type: "gift".to_string(),
        username,
        content: format!("{action}了 {gift_name} ×{count}"),
        timestamp,
        avatar: data.get("face").and_then(Value::as_str).map(ToString::to_string),
        medal: parse_object_medal(data.get("medal_info")),
        uid,
        color: 16_777_215,
        guard_level: data.get("guard_level").and_then(value_as_u64).unwrap_or(0) as u8,
        is_admin: false,
        dm_type: 0,
        price: data.get("price").and_then(value_as_u64).map(|value| value as u32),
        gift_name: Some(gift_name),
        count: Some(count),
        background_color: None,
        background_bottom_color: None,
        background_price_color: None,
        message_font_color: None,
        background_image: None,
        emots: None,
        emoticon_options: None,
    })
}

fn parse_interact_word(command: &Value, room_id: u64) -> Option<DanmakuEvent> {
    let data = command.get("data")?;
    let uinfo = data.get("uinfo");
    let base = uinfo.and_then(|value| value.get("base"));
    let username = base
        .and_then(|value| value.get("name"))
        .and_then(Value::as_str)
        .or_else(|| data.get("uname").and_then(Value::as_str))?
        .to_string();
    let uid = uinfo
        .and_then(|value| value.get("uid"))
        .and_then(value_as_u64)
        .or_else(|| data.get("uid").and_then(value_as_u64))
        .unwrap_or(0);
    let timestamp = data.get("timestamp").and_then(value_as_u64).unwrap_or(0);
    let msg_type = data.get("msg_type").and_then(value_as_u64).unwrap_or(1);
    let content = match msg_type {
        1 => "进入了直播间",
        2 => "关注了主播",
        3 => "分享了直播间",
        4 => "特别关注了主播",
        5 => "和主播互相关注了",
        6 => "点赞了直播间",
        _ => "触发了互动消息",
    }
    .to_string();

    Some(DanmakuEvent {
        id: format!("interact-{room_id}-{uid}-{timestamp}"),
        room_id,
        event_type: "entry".to_string(),
        username,
        content,
        timestamp,
        avatar: base
            .and_then(|value| value.get("face"))
            .and_then(Value::as_str)
            .map(ToString::to_string),
        medal: parse_object_medal(data.get("fans_medal")),
        uid,
        color: 16_777_215,
        guard_level: data
            .get("fans_medal")
            .and_then(|value| value.get("guard_level"))
            .and_then(value_as_u64)
            .unwrap_or(0) as u8,
        is_admin: false,
        dm_type: 0,
        price: None,
        gift_name: None,
        count: None,
        background_color: None,
        background_bottom_color: None,
        background_price_color: None,
        message_font_color: None,
        background_image: None,
        emots: None,
        emoticon_options: None,
    })
}

fn parse_super_chat(command: &Value, room_id: u64) -> Option<DanmakuEvent> {
    let data = command.get("data")?;
    let user_info = data.get("user_info")?;
    let gift = data.get("gift");
    let username = user_info.get("uname")?.as_str()?.to_string();
    let uid = data.get("uid").and_then(value_as_u64).unwrap_or(0);
    let content = data.get("message")?.as_str()?.to_string();
    let timestamp = data.get("start_time").and_then(value_as_u64).unwrap_or(0);
    let id = data
        .get("id")
        .and_then(value_as_u64)
        .map(|value| value.to_string())
        .unwrap_or_else(|| format!("sc-{room_id}-{uid}-{timestamp}"));

    Some(DanmakuEvent {
        id,
        room_id,
        event_type: "superChat".to_string(),
        username,
        content,
        timestamp,
        avatar: user_info.get("face").and_then(Value::as_str).map(ToString::to_string),
        medal: parse_object_medal(data.get("medal_info")),
        uid,
        color: 16_777_215,
        guard_level: user_info.get("guard_level").and_then(value_as_u64).unwrap_or(0) as u8,
        is_admin: false,
        dm_type: 0,
        price: data.get("price").and_then(value_as_u64).map(|value| value as u32),
        gift_name: gift
            .and_then(|value| value.get("gift_name"))
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .or_else(|| Some("醒目留言".to_string())),
        count: gift.and_then(|value| value.get("num")).and_then(value_as_u64).map(|value| value as u32),
        background_color: data
            .get("background_color")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        background_bottom_color: data
            .get("background_bottom_color")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        background_price_color: data
            .get("background_price_color")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        message_font_color: data
            .get("message_font_color")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        background_image: data
            .get("background_image")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        emots: None,
        emoticon_options: None,
    })
}

fn parse_array_medal(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_array)
        .filter(|medal| !medal.is_empty())
        .map(|medal| {
            format!(
                "{} {}",
                medal.get(1).and_then(Value::as_str).unwrap_or_default(),
                medal.get(0).and_then(value_as_u64).unwrap_or_default()
            )
        })
        .filter(|value| !value.trim().is_empty())
}

fn parse_object_medal(value: Option<&Value>) -> Option<String> {
    let value = value?;
    let medal_name = value.get("medal_name").and_then(Value::as_str).unwrap_or_default();
    let medal_level = value.get("medal_level").and_then(value_as_u64).unwrap_or_default();
    let display = format!("{} {}", medal_name, medal_level);
    (!display.trim().is_empty() && !medal_name.trim().is_empty()).then_some(display)
}

fn make_packet(body: &[u8], operation: u32) -> Result<Vec<u8>, String> {
    let pack_len = (HEADER_SIZE + body.len()) as u32;
    let mut packet = Vec::with_capacity(pack_len as usize);
    packet.extend_from_slice(&pack_len.to_be_bytes());
    packet.extend_from_slice(&(HEADER_SIZE as u16).to_be_bytes());
    packet.extend_from_slice(&1u16.to_be_bytes());
    packet.extend_from_slice(&operation.to_be_bytes());
    packet.extend_from_slice(&1u32.to_be_bytes());
    packet.extend_from_slice(body);
    Ok(packet)
}

fn decompress_brotli(body: &[u8]) -> Result<Vec<u8>, String> {
    let mut decompressor = Decompressor::new(body, 4096);
    let mut output = Vec::new();
    decompressor
        .read_to_end(&mut output)
        .map_err(|error| error.to_string())?;
    Ok(output)
}

fn decompress_zlib(body: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = ZlibDecoder::new(body);
    let mut output = Vec::new();
    decoder.read_to_end(&mut output).map_err(|error| error.to_string())?;
    Ok(output)
}

fn value_as_u64(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_i64().and_then(|number| u64::try_from(number).ok()))
}
