use crate::models::message::{DanmakuEvent, Medal};
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
                3 => match decompress_brotli(body) {
                    Ok(decompressed) => match decode_packets(&decompressed) {
                        Ok(mut sub) => packets.append(&mut sub),
                        Err(e) => log::warn!("子包解析失败 (brotli ver=3): {e}"),
                    },
                    Err(e) => log::warn!("Brotli 解压失败: {e}"),
                },
                2 => match decompress_zlib(body) {
                    Ok(decompressed) => match decode_packets(&decompressed) {
                        Ok(mut sub) => packets.append(&mut sub),
                        Err(e) => log::warn!("子包解析失败 (zlib ver=2): {e}"),
                    },
                    Err(e) => log::warn!("Zlib 解压失败: {e}"),
                },
                _ => match serde_json::from_slice::<Value>(body) {
                    Ok(payload) => packets.push(ParsedPacket::Command(payload)),
                    Err(e) => log::warn!("JSON 解析失败 (ver={}): {e}", header.ver),
                },
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

    if cmd == "INTERACT_WORD_V2" {
        return parse_interact_word_v2(command, room_id);
    }

    if cmd == "SUPER_CHAT_MESSAGE" {
        return parse_super_chat(command, room_id);
    }

    if cmd == "GUARD_BUY" {
        return parse_guard_buy(command, room_id);
    }

    if cmd == "LIVE" {
        return parse_live_status(command, room_id, "live", "开播了");
    }

    // PREPARING 存在 PREPARINGx 等变体
    if cmd.starts_with("PREPARING") {
        return parse_live_status(command, room_id, "preparing", "下播了");
    }

    if cmd.starts_with("LIKE_INFO_V3_CLICK") {
        return parse_like_info_v3_click(command, room_id);
    }

    None
}

/// 开播/下播标记：LIVE 根级携带 live_time（unix 秒）；PREPARING 无 live_time，
/// 用 send_time（服务器发送时间，unix 毫秒）兜底
fn parse_live_status(command: &Value, room_id: u64, event_type: &str, content: &str) -> Option<DanmakuEvent> {
    let timestamp = match event_type {
        // 文档规定 live_time 在根级（unix 秒）
        "live" => command.get("live_time").and_then(value_as_u64).unwrap_or_else(system_unix_now),
        _ => command
            .get("send_time")
            .and_then(value_as_u64)
            .map(|millis| millis / 1000)
            .unwrap_or_else(system_unix_now),
    };
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.subsec_nanos())
        .unwrap_or(0);

    Some(DanmakuEvent {
        id: format!("{event_type}-{room_id}-{timestamp}-{nanos}"),
        room_id,
        event_type: event_type.to_string(),
        username: String::new(),
        content: content.to_string(),
        timestamp,
        avatar: None,
        medal: None,
        wealth_level: None,
        uid: 0,
        color: 16_777_215,
        guard_level: 0,
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
        reply_uid: None,
        reply_username: None,
        contribution_rank: None,
    })
}

fn system_unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn parse_text_danmaku(command: &Value, room_id: u64) -> Option<DanmakuEvent> {
    let info = command.get("info")?.as_array()?;
    let content = info.get(1)?.as_str()?.to_string();
    let user_info = info.get(2)?.as_array()?;
    let basic = info.first()?.as_array()?;

    // v2 格式：用户信息在 basic[15].user 中
    let user_v2 = basic
        .get(15)
        .and_then(Value::as_object)
        .and_then(|mode_info| mode_info.get("user"))
        .and_then(Value::as_object);

    // uid：优先从 v2 格式获取，fallback 到旧格式 info[2][0]
    let uid = user_v2
        .and_then(|user| user.get("uid"))
        .and_then(value_as_u64)
        .or_else(|| user_info.first().and_then(value_as_u64))
        .unwrap_or(0);

    // username：优先从 v2 格式获取，fallback 到旧格式 info[2][1]
    let username = user_v2
        .and_then(|user| user.get("base"))
        .and_then(Value::as_object)
        .and_then(|base| base.get("name"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .or_else(|| user_info.get(1).and_then(Value::as_str).map(ToString::to_string))
        .unwrap_or_default();

    let timestamp = basic.get(4).and_then(value_as_u64).unwrap_or(0);
    let id = basic.get(5).and_then(value_as_u64).unwrap_or(timestamp).to_string();
    let color = basic.get(3).and_then(value_as_u64).unwrap_or(16_777_215) as u32;
    let dm_type = basic.get(12).and_then(value_as_u64).unwrap_or(0) as u8;
    let is_admin = user_info.get(2).and_then(value_as_u64).unwrap_or(0) == 1;
    let guard_level = info.get(7).and_then(value_as_u64).unwrap_or(0) as u8;

    // 解析 extra 字段（包含 @回复、表情等信息）
    let extra: Option<Value> = basic
        .get(15)
        .and_then(|value| value.get("extra"))
        .and_then(Value::as_str)
        .and_then(|value| serde_json::from_str::<Value>(value).ok());

    // 优先从 v2 格式解析勋章（basic[15].user.medal），fallback 到旧数组格式（info[3]）
    let medal = user_v2
        .and_then(|user| user.get("medal"))
        .and_then(|m| parse_object_medal(Some(m)))
        .or_else(|| parse_array_medal(info.get(3)));
    // info[16] = [wealth_level, ...] 荣耀等级
    let wealth_level = info.get(16).and_then(Value::as_array).and_then(|a| a.first()).and_then(value_as_u64);
    let emots = extra
        .as_ref()
        .and_then(|e| e.get("emots").cloned())
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

    let avatar = user_v2
        .and_then(|user| user.get("base"))
        .and_then(Value::as_object)
        .and_then(|base| base.get("face"))
        .and_then(Value::as_str)
        .map(ToString::to_string);

    // @回复信息
    let reply_uid = extra
        .as_ref()
        .and_then(|e| e.get("reply_mid"))
        .and_then(value_as_u64)
        .filter(|&v| v > 0);
    let reply_username = extra
        .as_ref()
        .and_then(|e| e.get("reply_uname"))
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
        wealth_level,
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
        reply_uid,
        reply_username,
        contribution_rank: None,
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
        wealth_level: None,
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
        reply_uid: None,
        reply_username: None,
        contribution_rank: None,
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
    if msg_type == 6 {
        return None;
    }
    let content = match msg_type {
        1 => "进入了直播间",
        2 => "关注了主播",
        3 => "分享了直播间",
        4 => "特别关注了主播",
        5 => "和主播互相关注了",
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
        wealth_level: None,
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
        reply_uid: None,
        reply_username: None,
        contribution_rank: None,
    })
}

/// 最小化 protobuf wire format 读取器，仅支持 INTERACT_WORD_V2 所需的字段
struct PbReader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> PbReader<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, pos: 0 }
    }

    fn read_varint(&mut self) -> Option<u64> {
        let saved_pos = self.pos;
        let mut result = 0u64;
        let mut shift = 0;
        loop {
            if self.pos >= self.data.len() {
                self.pos = saved_pos; // 恢复位置，避免后续解析错位
                return None;
            }
            let byte = self.data[self.pos];
            self.pos += 1;
            result |= ((byte & 0x7F) as u64) << shift;
            if byte & 0x80 == 0 {
                return Some(result);
            }
            shift += 7;
            if shift >= 64 {
                self.pos = saved_pos;
                return None; // varint 过长，防止溢出
            }
        }
    }

    fn read_bytes(&mut self) -> Option<&'a [u8]> {
        let saved_pos = self.pos;
        let len = self.read_varint()? as usize;
        if self.pos + len > self.data.len() {
            self.pos = saved_pos;
            return None;
        }
        let slice = &self.data[self.pos..self.pos + len];
        self.pos += len;
        Some(slice)
    }

    fn skip_field(&mut self, wire_type: u64) -> Option<()> {
        match wire_type {
            0 => {
                self.read_varint()?;
                Some(())
            }
            1 => {
                if self.pos + 8 > self.data.len() {
                    return None;
                }
                self.pos += 8;
                Some(())
            }
            2 => {
                self.read_bytes()?;
                Some(())
            }
            5 => {
                if self.pos + 4 > self.data.len() {
                    return None;
                }
                self.pos += 4;
                Some(())
            }
            _ => None,
        }
    }
}

/// 解析 INTERACT_WORD_V2 的 protobuf 数据
/// 字段编号（来自 bilibili-API-collect）：
///   1=uid(varint), 2=uname(string), 5=msg_type(varint), 7=timestamp(varint),
///   9=fans_medal_info(bytes, 嵌套消息，2=medal_level, 3=medal_name, 8=is_lighted, 9=guard_level)
fn parse_interact_word_v2(command: &Value, room_id: u64) -> Option<DanmakuEvent> {
    use base64::Engine;
    let pb_b64 = command.get("data")?.get("pb")?.as_str()?;
    let pb_bytes = base64::engine::general_purpose::STANDARD.decode(pb_b64).ok()?;
    let mut reader = PbReader::new(&pb_bytes);

    let mut uid: u64 = 0;
    let mut uname = String::new();
    let mut msg_type: u64 = 1;
    let mut timestamp: u64 = 0;
    let mut guard_level: u8 = 0;
    let mut medal = None;

    while reader.pos < reader.data.len() {
        let Some(tag) = reader.read_varint() else { break };
        let field_number = tag >> 3;
        let wire_type = tag & 0x7;

        match field_number {
            1 => {
                if wire_type == 0 {
                    if let Some(v) = reader.read_varint() { uid = v; }
                } else if reader.skip_field(wire_type).is_none() { break; }
            }
            2 => {
                if wire_type == 2 {
                    if let Some(bytes) = reader.read_bytes() {
                        uname = String::from_utf8_lossy(bytes).to_string();
                    }
                } else if reader.skip_field(wire_type).is_none() { break; }
            }
            5 => {
                if wire_type == 0 {
                    if let Some(v) = reader.read_varint() { msg_type = v; }
                } else if reader.skip_field(wire_type).is_none() { break; }
            }
            7 => {
                if wire_type == 0 {
                    if let Some(v) = reader.read_varint() { timestamp = v; }
                } else if reader.skip_field(wire_type).is_none() { break; }
            }
            9 => {
                // fans_medal_info 嵌套消息
                if wire_type == 2 {
                    if let Some(medal_data) = reader.read_bytes() {
                        let (m, gl) = parse_pb_fans_medal(medal_data);
                        medal = m;
                        guard_level = gl;
                    }
                } else if reader.skip_field(wire_type).is_none() { break; }
            }
            _ => {
                if reader.skip_field(wire_type).is_none() { break; }
            }
        }
    }

    if uname.is_empty() {
        return None;
    }
    if msg_type == 6 {
        return None;
    }
    let content = match msg_type {
        1 => "进入了直播间",
        2 => "关注了主播",
        3 => "分享了直播间",
        4 => "特别关注了主播",
        5 => "和主播互相关注了",
        _ => "触发了互动消息",
    }
    .to_string();

    Some(DanmakuEvent {
        id: format!("interact-{room_id}-{uid}-{timestamp}"),
        room_id,
        event_type: "entry".to_string(),
        username: uname,
        content,
        timestamp,
        avatar: None,
        medal,
        wealth_level: None,
        uid,
        color: 16_777_215,
        guard_level,
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
        reply_uid: None,
        reply_username: None,
        contribution_rank: None,
    })
}

/// 解析 INTERACT_WORD_V2 中 fans_medal_info 的 protobuf 嵌套消息
/// 返回 (Medal, guard_level)
fn parse_pb_fans_medal(data: &[u8]) -> (Option<Medal>, u8) {
    let mut reader = PbReader::new(data);
    let mut name = String::new();
    let mut level: u64 = 0;
    let mut is_light: u8 = 0;
    let mut guard_level: u8 = 0;

    while reader.pos < reader.data.len() {
        let tag = reader.read_varint();
        let Some(tag) = tag else { break };
        let field_number = tag >> 3;
        let wire_type = tag & 0x7;

        match field_number {
            2 => {
                if wire_type == 0 {
                    if let Some(v) = reader.read_varint() {
                        level = v;
                    }
                } else {
                    reader.skip_field(wire_type);
                }
            }
            3 => {
                if wire_type == 2 {
                    if let Some(bytes) = reader.read_bytes() {
                        name = String::from_utf8_lossy(bytes).to_string();
                    }
                } else {
                    reader.skip_field(wire_type);
                }
            }
            8 => {
                if wire_type == 0 {
                    if let Some(v) = reader.read_varint() {
                        is_light = v as u8;
                    }
                } else {
                    reader.skip_field(wire_type);
                }
            }
            9 => {
                if wire_type == 0 {
                    if let Some(v) = reader.read_varint() {
                        guard_level = v as u8;
                    }
                } else {
                    reader.skip_field(wire_type);
                }
            }
            _ => {
                reader.skip_field(wire_type);
            }
        }
    }

    let medal = if !name.is_empty() || level > 0 {
        Some(Medal { name, level, is_light })
    } else {
        None
    };
    (medal, guard_level)
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
        wealth_level: None,
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
        reply_uid: None,
        reply_username: None,
        contribution_rank: None,
    })
}

fn parse_guard_buy(command: &Value, room_id: u64) -> Option<DanmakuEvent> {
    let data = command.get("data")?;
    let username = data.get("username").and_then(Value::as_str).unwrap_or("").to_string();
    let uid = data.get("uid").and_then(value_as_u64).unwrap_or(0);
    let guard_level = data.get("guard_level").and_then(value_as_u64).unwrap_or(0) as u8;
    let gift_name = data.get("gift_name").and_then(Value::as_str).unwrap_or("舰长").to_string();
    let count = data.get("num").and_then(value_as_u64).unwrap_or(1) as u32;
    let price = data.get("price").and_then(value_as_u64).map(|v| v as u32);
    let timestamp = data.get("start_time").and_then(value_as_u64)
        .or_else(|| data.get("end_time").and_then(value_as_u64))
        .unwrap_or(0);
    let id = format!("guard-{room_id}-{uid}-{timestamp}");

    Some(DanmakuEvent {
        id,
        room_id,
        event_type: "guard".to_string(),
        username,
        content: format!("开通了 {gift_name} ×{count}"),
        timestamp,
        avatar: None,
        medal: None,
        wealth_level: None,
        uid,
        color: 16_777_215,
        guard_level,
        is_admin: false,
        dm_type: 0,
        price,
        gift_name: Some(gift_name),
        count: Some(count),
        background_color: None,
        background_bottom_color: None,
        background_price_color: None,
        message_font_color: None,
        background_image: None,
        emots: None,
        emoticon_options: None,
        reply_uid: None,
        reply_username: None,
        contribution_rank: None,
    })
}

fn parse_like_info_v3_click(command: &Value, room_id: u64) -> Option<DanmakuEvent> {
    let data = command.get("data")?;
    let uid = data.get("uid").and_then(value_as_u64).unwrap_or(0);
    let username = data.get("uname").and_then(Value::as_str)?.to_string();
    let timestamp = data.get("timestamp").and_then(value_as_u64).unwrap_or(0);
    let click_time = data.get("click_time").and_then(value_as_u64).unwrap_or(1) as u32;

    let content = data
        .get("like_text")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("为主播点赞了")
        .chars()
        .take(50)
        .collect::<String>();

    Some(DanmakuEvent {
        id: format!("like-{room_id}-{uid}-{timestamp}"),
        room_id,
        event_type: "like".to_string(),
        username,
        content,
        timestamp,
        avatar: None,
        medal: parse_object_medal(data.get("fans_medal")),
        wealth_level: None,
        uid,
        color: 16_777_215,
        guard_level: 0,
        is_admin: false,
        dm_type: 0,
        price: None,
        gift_name: None,
        count: Some(click_time),
        background_color: None,
        background_bottom_color: None,
        background_price_color: None,
        message_font_color: None,
        background_image: None,
        emots: None,
        emoticon_options: None,
        reply_uid: None,
        reply_username: None,
        contribution_rank: None,
    })
}

fn parse_array_medal(value: Option<&Value>) -> Option<Medal> {
    let arr = value.and_then(Value::as_array).filter(|a| !a.is_empty())?;
    let name = arr.get(1).and_then(Value::as_str).unwrap_or_default().to_string();
    let level = arr.get(0).and_then(value_as_u64).unwrap_or_default();
    let is_light = arr.get(11).and_then(value_as_u64).unwrap_or(0) as u8;
    (!name.trim().is_empty()).then_some(Medal { name, level, is_light })
}

fn parse_object_medal(value: Option<&Value>) -> Option<Medal> {
    let value = value?;
    let name = value.get("medal_name").and_then(Value::as_str).unwrap_or_default().to_string();
    let level = value.get("medal_level").and_then(value_as_u64).unwrap_or_default();
    let is_light = value.get("is_lighted").and_then(value_as_u64)
        .or_else(|| value.get("is_light").and_then(value_as_u64))
        .unwrap_or(0) as u8;
    (!name.trim().is_empty()).then_some(Medal { name, level, is_light })
}

pub(crate) fn make_packet(body: &[u8], operation: u32) -> Result<Vec<u8>, String> {
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
