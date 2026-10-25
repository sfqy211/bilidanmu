//! B 站直播 WS V2 载荷的最小 protobuf wire 解码器（SEND_GIFT_V2 等）。
//!
//! 只实现用到的 wire 子集（varint / length-delimited / fixed32 / fixed64），
//! 字段语义来自社区逆向的 .proto 定义。
//! 实现参考 JLiverTool（MIT License, Copyright (c) 2021-2023 Xinrea）。

use std::collections::HashMap;

/// 解码后的 protobuf 字段值
#[derive(Debug, Clone)]
pub enum PbValue {
    Varint(u64),
    Fixed64(u64),
    Bytes(Vec<u8>),
    Fixed32(u32),
}

impl PbValue {
    pub fn as_u64(&self) -> Option<u64> {
        match self {
            Self::Varint(v) => Some(*v),
            Self::Fixed64(v) => Some(*v),
            Self::Fixed32(v) => Some(u64::from(*v)),
            Self::Bytes(_) => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        self.as_u64().map(|v| v as i64)
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::Bytes(b) => std::str::from_utf8(b).ok(),
            _ => None,
        }
    }

    pub fn as_bytes(&self) -> Option<&[u8]> {
        match self {
            Self::Bytes(b) => Some(b),
            _ => None,
        }
    }
}

/// 解码后的消息：字段号 → 一个或多个值（repeated 字段）
#[derive(Debug, Clone, Default)]
pub struct PbMessage {
    fields: HashMap<u32, Vec<PbValue>>,
}

impl PbMessage {
    pub fn get_first(&self, field: u32) -> Option<&PbValue> {
        self.fields.get(&field).and_then(|v| v.first())
    }

    pub fn get_all(&self, field: u32) -> &[PbValue] {
        self.fields.get(&field).map(|v| v.as_slice()).unwrap_or(&[])
    }

    pub fn get_u64(&self, field: u32) -> Option<u64> {
        self.get_first(field)?.as_u64()
    }

    pub fn get_i64(&self, field: u32) -> Option<i64> {
        self.get_first(field)?.as_i64()
    }

    pub fn get_str(&self, field: u32) -> Option<&str> {
        self.get_first(field)?.as_str()
    }

    pub fn get_message(&self, field: u32) -> Option<PbMessage> {
        let bytes = self.get_first(field)?.as_bytes()?;
        decode_message(bytes).ok()
    }

    pub fn get_messages(&self, field: u32) -> Vec<PbMessage> {
        self.get_all(field)
            .iter()
            .filter_map(|v| v.as_bytes())
            .filter_map(|b| decode_message(b).ok())
            .collect()
    }
}

/// 从字节解码一条 protobuf 消息
pub fn decode_message(buf: &[u8]) -> Result<PbMessage, String> {
    let mut fields: HashMap<u32, Vec<PbValue>> = HashMap::new();
    let mut i = 0;

    while i < buf.len() {
        let (key, next) = read_varint(buf, i)?;
        i = next;
        let field = (key >> 3) as u32;
        let wire = (key & 0x7) as u8;

        let value = match wire {
            0 => {
                let (v, next) = read_varint(buf, i)?;
                i = next;
                PbValue::Varint(v)
            }
            1 => {
                if i + 8 > buf.len() {
                    return Err("protobuf fixed64 truncated".into());
                }
                let v = u64::from_le_bytes(buf[i..i + 8].try_into().unwrap());
                i += 8;
                PbValue::Fixed64(v)
            }
            2 => {
                let (len, next) = read_varint(buf, i)?;
                i = next;
                let len = len as usize;
                if i + len > buf.len() {
                    return Err("protobuf bytes truncated".into());
                }
                let bytes = buf[i..i + len].to_vec();
                i += len;
                PbValue::Bytes(bytes)
            }
            5 => {
                if i + 4 > buf.len() {
                    return Err("protobuf fixed32 truncated".into());
                }
                let v = u32::from_le_bytes(buf[i..i + 4].try_into().unwrap());
                i += 4;
                PbValue::Fixed32(v)
            }
            other => {
                return Err(format!("unsupported protobuf wire type {other}"));
            }
        };

        fields.entry(field).or_default().push(value);
    }

    Ok(PbMessage { fields })
}

fn read_varint(buf: &[u8], mut i: usize) -> Result<(u64, usize), String> {
    let mut result: u64 = 0;
    let mut shift = 0;
    loop {
        if i >= buf.len() {
            return Err("protobuf varint truncated".into());
        }
        let byte = buf[i];
        i += 1;
        result |= u64::from(byte & 0x7f) << shift;
        if byte & 0x80 == 0 {
            return Ok((result, i));
        }
        shift += 7;
        if shift >= 64 {
            return Err("protobuf varint overflow".into());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_simple_string_and_varint() {
        // field 1 varint 150, field 2 string "testing"
        let buf = [
            0x08, 0x96, 0x01, 0x12, 0x07, b't', b'e', b's', b't', b'i', b'n', b'g',
        ];
        let msg = decode_message(&buf).unwrap();
        assert_eq!(msg.get_u64(1), Some(150));
        assert_eq!(msg.get_str(2), Some("testing"));
    }

    #[test]
    fn decode_nested_message_and_repeated() {
        // field 3 (length-delimited) 内含 field 1 varint 7；field 2 出现两次（repeated）
        let inner = [0x08, 0x07];
        let mut buf = vec![0x1a, inner.len() as u8];
        buf.extend_from_slice(&inner);
        // field 2 出现两次，各含一条合法嵌套消息（field 1 varint）
        for v in [0x05u8, 0x09] {
            buf.extend_from_slice(&[0x12, 0x02, 0x08, v]);
        }

        let msg = decode_message(&buf).unwrap();
        assert_eq!(msg.get_message(3).unwrap().get_u64(1), Some(7));
        let repeated = msg.get_messages(2);
        assert_eq!(repeated.len(), 2);
        assert_eq!(repeated[1].get_u64(1), Some(9));
    }
}
