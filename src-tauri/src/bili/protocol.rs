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
    if command.get("cmd")?.as_str()?.starts_with("DANMU_MSG") {
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

        let medal = info
            .get(3)
            .and_then(Value::as_array)
            .filter(|medal| !medal.is_empty())
            .map(|medal| {
                format!(
                    "{} {}",
                    medal.get(1).and_then(Value::as_str).unwrap_or_default(),
                    medal.get(0).and_then(value_as_u64).unwrap_or_default()
                )
            })
            .filter(|value| !value.trim().is_empty());

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

        return Some(DanmakuEvent {
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
        });
    }

    None
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
