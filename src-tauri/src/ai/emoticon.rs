//! 表情类弹幕的识别与聚合（MCP 输出用）。
//!
//! 两类内容都算「表情」：
//! - 大表情弹幕：`dm_type == 1` / 带 `emots`，正文是触发词，图片在 `emots` 里
//! - 纯 emoji 文本：如 `👀`，没有 emots，但整条只有 emoji
//!
//! 缓冲里永远存原始事件，这里只在输出时打标或聚合，AI 换参数可以重新读。

use crate::models::message::DanmakuEvent;
use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct EmoticonMeta {
    /// 稳定唯一键：优先 `emotion_unique`，fallback 到 emots 的键名 / 正文
    pub unique: String,
    /// 展示名：`descript` / `emoji` / 键名
    pub name: String,
    pub url: Option<String>,
}

/// 大表情弹幕 → 表情元信息；普通文字弹幕返回 None。
pub fn emoticon_meta(event: &DanmakuEvent) -> Option<EmoticonMeta> {
    if event.dm_type != 1 && event.emots.is_none() {
        return None;
    }
    if let Some(map) = event.emots.as_ref().and_then(Value::as_object) {
        if let Some((key, value)) = map.iter().next() {
            let unique = value
                .get("emotion_unique")
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
                .unwrap_or(key.as_str())
                .to_string();
            let name = value
                .get("descript")
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
                .or_else(|| {
                    value
                        .get("emoji")
                        .and_then(Value::as_str)
                        .filter(|text| !text.is_empty())
                })
                .unwrap_or(key.as_str())
                .to_string();
            let url = value
                .get("url")
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
                .map(ToString::to_string);
            return Some(EmoticonMeta { unique, name, url });
        }
    }
    // dm_type == 1 但没有 emots（房间独有表情等）：用正文当名字，仍可聚合
    Some(EmoticonMeta {
        unique: format!("text:{}", event.content),
        name: event.content.clone(),
        url: None,
    })
}

/// 整条内容是否只由 emoji / 空白组成。
pub fn is_emoji_only(text: &str) -> bool {
    let mut saw_emoji = false;
    for ch in text.chars() {
        let code = ch as u32;
        let emoji = (0x1F000..=0x1FAFF).contains(&code)
            || (0x2600..=0x27BF).contains(&code)
            || (0x2B00..=0x2BFF).contains(&code)
            || matches!(
                code,
                0x20E3 | 0x200D | 0x3030 | 0x303D | 0x3297 | 0x3299 | 0xFE0E | 0xFE0F
            );
        if emoji {
            saw_emoji = true;
            continue;
        }
        if ch.is_whitespace() {
            continue;
        }
        return false;
    }
    saw_emoji
}

/// 纯表情消息：整条就是大表情（dm_type=1）或纯 emoji 文本。
/// 这类默认不返回；带表情的文字（dm_type=0 + emots）不算。
pub fn is_pure_emoticon(event: &DanmakuEvent) -> bool {
    event.dm_type == 1 || is_emoji_only(&event.content)
}

/// 给单条事件补上表情标识（keep 模式用）。
pub fn decorate(value: &mut Value, event: &DanmakuEvent) {
    let Some(object) = value.as_object_mut() else {
        return;
    };
    let pure = is_pure_emoticon(event);
    if let Some(meta) = emoticon_meta(event) {
        object.insert("isEmoticon".to_string(), json!(true));
        let mut emoticon = json!({
            "unique": meta.unique,
            "name": meta.name,
            "kind": if pure { "sticker" } else { "inline" },
        });
        if let Some(url) = meta.url {
            emoticon["url"] = json!(url);
        }
        object.insert("emoticon".to_string(), emoticon);
        if pure {
            // 整条就是表情：改掉 type，避免被当成字幕/聊天内容
            object.insert("type".to_string(), json!("emoticon"));
        } else {
            object.insert("inlineEmoticon".to_string(), json!(true));
        }
    } else if is_emoji_only(&event.content) {
        object.insert("isEmoticon".to_string(), json!(true));
        object.insert("emojiOnly".to_string(), json!(true));
        object.insert("type".to_string(), json!("emoticon"));
        object.insert(
            "emoticon".to_string(),
            json!({
                "unique": format!("emoji:{}", event.content.trim()),
                "name": event.content.trim(),
                "kind": "emoji",
            }),
        );
    }
}

/// 聚合窗口内的表情类弹幕。
///
/// - 相同表情（或相同纯 emoji 文本）合并成一条
/// - 默认不带发送者；`include_senders` 为真时附带按次数排序的发送者（最多 `sender_limit` 个）
pub fn aggregate(
    events: impl Iterator<Item = DanmakuEvent>,
    include_senders: bool,
    sender_limit: usize,
) -> Vec<Value> {
    struct Group {
        key: String,
        name: String,
        url: Option<String>,
        emoji: Option<String>,
        count: u64,
        senders: HashMap<String, u64>,
    }

    let mut order: Vec<String> = Vec::new();
    let mut groups: HashMap<String, Group> = HashMap::new();

    for event in events {
        if event.event_type != "danmaku" {
            continue;
        }
        let (key, name, url, emoji) = if let Some(meta) = emoticon_meta(&event) {
            (format!("emoticon:{}", meta.unique), meta.name, meta.url, None)
        } else if is_emoji_only(&event.content) {
            (
                format!("emoji:{}", event.content.trim()),
                event.content.trim().to_string(),
                None,
                Some(event.content.trim().to_string()),
            )
        } else {
            continue;
        };

        let group = groups.entry(key.clone()).or_insert_with(|| {
            order.push(key.clone());
            Group {
                key,
                name,
                url,
                emoji,
                count: 0,
                senders: HashMap::new(),
            }
        });
        group.count += 1;
        // 人数始终统计（用于 senderCount）；名单是否输出由 include_senders 决定
        if !event.username.is_empty() {
            *group.senders.entry(event.username).or_insert(0) += 1;
        }
    }

    let mut result: Vec<Value> = order
        .into_iter()
        .filter_map(|key| groups.remove(&key))
        .map(|group| {
            let mut value = json!({
                "type": "emoticonAggregate",
                "key": group.key,
                "name": group.name,
                "count": group.count,
                "senderCount": group.senders.len(),
            });
            if let Some(url) = group.url {
                value["url"] = json!(url);
            }
            if let Some(emoji) = group.emoji {
                value["emoji"] = json!(emoji);
            }
            if include_senders {
                let mut senders: Vec<(String, u64)> = group.senders.into_iter().collect();
                senders.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
                let truncated = senders.len() > sender_limit;
                let senders: Vec<Value> = senders
                    .into_iter()
                    .take(sender_limit)
                    .map(|(name, count)| json!({ "username": name, "count": count }))
                    .collect();
                value["senders"] = json!(senders);
                if truncated {
                    value["sendersTruncated"] = json!(true);
                }
            }
            value
        })
        .collect();

    result.sort_by(|a, b| {
        b.get("count")
            .and_then(Value::as_u64)
            .cmp(&a.get("count").and_then(Value::as_u64))
    });
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn danmaku(content: &str, username: &str) -> DanmakuEvent {
        let mut event: DanmakuEvent = serde_json::from_value(json!({
            "id": "1",
            "roomId": 1,
            "type": "danmaku",
            "username": username,
            "content": content,
            "timestamp": 1,
            "uid": 1,
            "color": 16777215,
            "guardLevel": 0,
            "isAdmin": false,
            "dmType": 0
        }))
        .expect("event");
        event
    }

    #[test]
    fn detects_emoji_only_text() {
        assert!(is_emoji_only("👀"));
        assert!(is_emoji_only(" 😂😂 "));
        assert!(is_emoji_only("🎉❤️"));
        assert!(!is_emoji_only("233"));
        assert!(!is_emoji_only("好的👌"));
        assert!(!is_emoji_only(""));
    }

    #[test]
    fn reads_emoticon_meta_from_emots() {
        let mut event = danmaku("[笑]", "u");
        event.dm_type = 1;
        event.emots = Some(json!({
            "笑": { "emotion_unique": "emoji_123", "descript": "笑", "url": "https://x/y.png" }
        }));
        let meta = emoticon_meta(&event).expect("meta");
        assert_eq!(meta.unique, "emoji_123");
        assert_eq!(meta.name, "笑");
        assert_eq!(meta.url.as_deref(), Some("https://x/y.png"));
    }

    #[test]
    fn aggregates_repeated_emoticons_without_senders() {
        let plain = json!([danmaku("你好", "a"), danmaku("👀", "a"), danmaku("👀", "b")]);
        let events: Vec<DanmakuEvent> = serde_json::from_value(plain).expect("events");
        let groups = aggregate(events.into_iter(), false, 10);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0]["count"], 2);
        assert_eq!(groups[0]["name"], "👀");
        assert!(groups[0].get("senders").is_none());
    }

    #[test]
    fn aggregates_with_sender_details() {
        let events: Vec<DanmakuEvent> =
            serde_json::from_value(json!([danmaku("👀", "a"), danmaku("👀", "a"), danmaku("👀", "b")]))
                .expect("events");
        let groups = aggregate(events.into_iter(), true, 1);
        assert_eq!(groups[0]["senderCount"], 2);
        assert_eq!(groups[0]["senders"][0]["username"], "a");
        assert_eq!(groups[0]["senders"].as_array().unwrap().len(), 1);
        assert_eq!(groups[0]["sendersTruncated"], true);
    }

    #[test]
    fn distinguishes_pure_and_inline_emoticons() {
        let mut sticker = danmaku("[笑]", "u");
        sticker.dm_type = 1;
        sticker.emots = Some(json!({"笑": {"emotion_unique": "emoji_1", "descript": "笑"}}));
        assert!(is_pure_emoticon(&sticker));

        let mut inline = danmaku("好[笑]", "u");
        inline.emots = Some(json!({"笑": {"emotion_unique": "emoji_1", "descript": "笑"}}));
        assert!(!is_pure_emoticon(&inline));
        assert!(emoticon_meta(&inline).is_some());

        let mut value = json!({"type": "danmaku", "content": "[笑]"});
        decorate(&mut value, &sticker);
        assert_eq!(value["type"], "emoticon");
        assert_eq!(value["isEmoticon"], true);
        assert_eq!(value["emoticon"]["kind"], "sticker");

        let mut value = json!({"type": "danmaku", "content": "好[笑]"});
        decorate(&mut value, &inline);
        assert_eq!(value["type"], "danmaku");
        assert_eq!(value["inlineEmoticon"], true);

        let emoji = danmaku("👀", "u");
        assert!(is_pure_emoticon(&emoji));
        let mut value = json!({"type": "danmaku", "content": "👀"});
        decorate(&mut value, &emoji);
        assert_eq!(value["type"], "emoticon");
        assert_eq!(value["emojiOnly"], true);
    }
}
