//! 直播间上下文缓冲：Rust 侧的弹幕/礼物/SC 环形缓冲。
//!
//! 前端已经有一份自己的 store，但 MCP server 跑在 Rust 进程内、拿不到 React 状态，
//! 所以 ws 客户端收到消息时在这里同步留一份。缓冲区有硬上限，只保留"最近"，
//! 不做持久化——历史回放不在需求内。

use crate::models::message::DanmakuEvent;
use std::collections::{HashMap, VecDeque};

/// 每类事件的保留上限。总量约 3×这个数，单条几百字节，几十 MB 级封顶。
const MAX_DANMAKU: usize = 2000;
const MAX_GIFT: usize = 500;
const MAX_ACTIVITY: usize = 500;
/// 语音字幕保留上限：约 30–60 分钟（取决于语速），与弹幕同级；
/// 唱歌段长句另设字符总量上限，防止单条极长时把条数上限顶穿内存。
const MAX_TRANSCRIPTS: usize = 500;
const MAX_TRANSCRIPT_CHARS: usize = 50_000;

/// 一条语音识别定稿片段（来自 STT 管线的 final 事件，只存内存不落盘）
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptEntry {
    pub text: String,
    /// 音频流内时间戳（毫秒，自 tee 连接起点起算）；epoch 变化表示时间轴重置过
    pub audio_ts_ms: i64,
    pub epoch: u64,
    /// 识别完成时的 Unix 秒
    pub timestamp: i64,
}

/// 当前直播间的滚动上下文
pub struct LiveContext {
    pub room_id: Option<u64>,
    /// 普通弹幕（不含礼物/SC/进场）
    danmaku: VecDeque<DanmakuEvent>,
    /// 礼物与醒目留言
    gifts: VecDeque<DanmakuEvent>,
    /// 进场/点赞等轻量活动
    activity: VecDeque<DanmakuEvent>,
    /// 语音识别定稿片段（STT 开启期间累积）
    transcripts: VecDeque<TranscriptEntry>,
    /// transcripts 当前字符总量（避免每次淘汰重算）
    transcript_chars: usize,
    /// 最近一次心跳拿到的人气值
    pub popularity: Option<u64>,
    /// 在线人数（ONLINE_RANK_COUNT）
    pub online_count: Option<u64>,
    /// 累计看过人数（WATCHED_CHANGE）
    pub watched_count: Option<u64>,
    /// 点赞总数（LIKE_INFO_V3_UPDATE）
    pub like_count: Option<u64>,
    /// 房间标题（ROOM_CHANGE 与进入房间时更新）
    pub title: Option<String>,
    /// WS 是否已连接
    pub connected: bool,
    /// 最近一次收到消息的时间（Unix 秒），用于算弹幕速率
    last_event_at: Option<i64>,
    /// 最近 60 秒窗口内的弹幕计数桶：第 i 个桶代表 [now-59+i, now-58+i) 秒
    rate_buckets: [u32; 60],
    /// rate_buckets 对应的起始秒
    rate_bucket_start: i64,
}

impl Default for LiveContext {
    fn default() -> Self {
        Self {
            room_id: None,
            danmaku: VecDeque::new(),
            gifts: VecDeque::new(),
            activity: VecDeque::new(),
            transcripts: VecDeque::new(),
            transcript_chars: 0,
            popularity: None,
            online_count: None,
            watched_count: None,
            like_count: None,
            title: None,
            connected: false,
            last_event_at: None,
            rate_buckets: [0; 60],
            rate_bucket_start: 0,
        }
    }
}

impl LiveContext {
    pub fn new() -> Self {
        Self::default()
    }

    /// 进入新房间时重置：旧房间的弹幕不该出现在新房间的上下文里。
    pub fn reset_for_room(&mut self, room_id: u64) {
        self.room_id = Some(room_id);
        self.danmaku.clear();
        self.gifts.clear();
        self.activity.clear();
        self.transcripts.clear();
        self.transcript_chars = 0;
        self.popularity = None;
        self.online_count = None;
        self.watched_count = None;
        self.like_count = None;
        self.title = None;
        self.last_event_at = None;
        self.rate_buckets = [0; 60];
        self.rate_bucket_start = 0;
    }

    pub fn disconnect(&mut self) {
        self.connected = false;
    }

    /// 记录一条已解析的事件。按类型分流到对应缓冲。
    pub fn push(&mut self, event: &DanmakuEvent) {
        let now = now_secs();
        self.last_event_at = Some(now);
        if self.rate_bucket_start == 0 {
            self.rate_bucket_start = now;
        }

        match event.event_type.as_str() {
            "danmaku" => {
                self.bump_rate(now);
                push_bounded(&mut self.danmaku, event, MAX_DANMAKU);
            }
            "gift" | "superChat" | "guard" => {
                push_bounded(&mut self.gifts, event, MAX_GIFT);
            }
            "entry" | "like" => {
                push_bounded(&mut self.activity, event, MAX_ACTIVITY);
            }
            // 开播/下播是系统标记：写入弹幕栏，让模型能看到场次切换
            "live" | "preparing" => {
                push_bounded(&mut self.danmaku, event, MAX_DANMAKU);
            }
            _ => {}
        }
    }

    fn bump_rate(&mut self, now: i64) {
        let elapsed = now - self.rate_bucket_start;
        if elapsed >= 60 {
            self.rate_buckets = [0; 60];
            self.rate_bucket_start = now;
            self.rate_buckets[0] = 1;
            return;
        }
        // elapsed < 0 说明系统时间回拨：原地重置，避免索引越界
        if elapsed < 0 {
            self.rate_buckets = [0; 60];
            self.rate_bucket_start = now;
            self.rate_buckets[0] = 1;
            return;
        }
        let index = (elapsed as usize).min(59);
        self.rate_buckets[index] = self.rate_buckets[index].saturating_add(1);
    }

    /// 最近 60 秒的弹幕条数
    pub fn danmaku_per_minute(&self) -> u32 {
        let now = now_secs();
        let elapsed = now - self.rate_bucket_start;
        if self.rate_bucket_start == 0 || elapsed >= 60 || elapsed < 0 {
            return 0;
        }
        self.rate_buckets.iter().sum()
    }

    /// 最近 N 条弹幕，按时间正序（最新的在最后）
    pub fn recent_danmaku(&self, limit: usize) -> Vec<&DanmakuEvent> {
        take_tail(&self.danmaku, limit)
    }

    /// 最近 N 条礼物/SC
    pub fn recent_gifts(&self, limit: usize) -> Vec<&DanmakuEvent> {
        take_tail(&self.gifts, limit)
    }

    /// 最近 N 条活动（进场/点赞）
    pub fn recent_activity(&self, limit: usize) -> Vec<&DanmakuEvent> {
        take_tail(&self.activity, limit)
    }

    /// 记录一条语音识别定稿片段。与上一条完全相同视为流式重复尾巴，直接丢弃。
    pub fn push_transcript(&mut self, text: &str, audio_ts_ms: i64, epoch: u64) {
        let text = text.trim();
        if text.is_empty() {
            return;
        }
        if self
            .transcripts
            .back()
            .is_some_and(|last| last.text == text)
        {
            return;
        }
        self.transcripts.push_back(TranscriptEntry {
            text: text.to_string(),
            audio_ts_ms,
            epoch,
            timestamp: now_secs(),
        });
        self.transcript_chars += text.chars().count();
        while self.transcripts.len() > MAX_TRANSCRIPTS
            || self.transcript_chars > MAX_TRANSCRIPT_CHARS
        {
            let Some(old) = self.transcripts.pop_front() else {
                break;
            };
            self.transcript_chars -= old.text.chars().count();
        }
    }

    /// 最近 N 条字幕，按时间正序（最新的在最后）；`usize::MAX` 取全部
    pub fn recent_transcripts(&self, limit: usize) -> Vec<TranscriptEntry> {
        let skip = self.transcripts.len().saturating_sub(limit);
        self.transcripts.iter().skip(skip).cloned().collect()
    }

    /// 已缓冲的字幕条数
    pub fn transcript_count(&self) -> usize {
        self.transcripts.len()
    }

    /// 按关键词过滤最近的弹幕（大小写不敏感，匹配内容与用户名）
    pub fn search_danmaku(&self, keyword: &str, limit: usize) -> Vec<&DanmakuEvent> {
        let needle = keyword.to_lowercase();
        let mut hits: Vec<&DanmakuEvent> = self
            .danmaku
            .iter()
            .filter(|event| {
                event.content.to_lowercase().contains(&needle)
                    || event.username.to_lowercase().contains(&needle)
            })
            .collect();
        if hits.len() > limit {
            hits = hits.split_off(hits.len() - limit);
        }
        hits
    }

    /// 按用户聚合弹幕条数，返回降序 TOP N
    pub fn top_speakers(&self, limit: usize) -> Vec<(String, u64, usize)> {
        let mut counts: HashMap<(String, u64), usize> = HashMap::new();
        for event in &self.danmaku {
            let key = (event.username.clone(), event.uid);
            *counts.entry(key).or_insert(0) += 1;
        }
        let mut ranked: Vec<(String, u64, usize)> = counts
            .into_iter()
            .map(|((username, uid), count)| (username, uid, count))
            .collect();
        ranked.sort_by(|a, b| b.2.cmp(&a.2));
        ranked.truncate(limit);
        ranked
    }

    /// 礼物聚合：按礼物名汇总数量与金额（金额为瓜子数，金瓜子 1000 = 1 元）
    pub fn gift_summary(&self, limit: usize) -> Vec<GiftAggregate> {
        let mut map: HashMap<String, GiftAggregate> = HashMap::new();
        for event in &self.gifts {
            let name = event
                .gift_name
                .clone()
                .unwrap_or_else(|| event.event_type.clone());
            let count = event.count.unwrap_or(1) as u64;
            let unit_price = event.price.unwrap_or(0) as u64;
            let entry = map.entry(name.clone()).or_insert(GiftAggregate {
                gift_name: name,
                count: 0,
                total_price: 0,
            });
            entry.count += count;
            entry.total_price += unit_price.saturating_mul(count);
        }
        let mut aggregates: Vec<GiftAggregate> = map.into_values().collect();
        aggregates.sort_by(|a, b| b.total_price.cmp(&a.total_price));
        aggregates.truncate(limit);
        aggregates
    }

    pub fn session_duration_secs(&self, live_start_time: Option<i64>) -> Option<i64> {
        let start = live_start_time?;
        if start <= 0 {
            return None;
        }
        Some((now_secs() - start).max(0))
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GiftAggregate {
    pub gift_name: String,
    pub count: u64,
    /// 瓜子总数（银瓜子与金瓜子混算，仅作热度参考）
    pub total_price: u64,
}

fn push_bounded(buffer: &mut VecDeque<DanmakuEvent>, event: &DanmakuEvent, max: usize) {
    if buffer.len() >= max {
        buffer.pop_front();
    }
    buffer.push_back(event.clone());
}

fn take_tail(buffer: &VecDeque<DanmakuEvent>, limit: usize) -> Vec<&DanmakuEvent> {
    let skip = buffer.len().saturating_sub(limit);
    buffer.iter().skip(skip).collect()
}

pub fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transcript_dedupes_consecutive_duplicate() {
        let mut context = LiveContext::new();
        context.push_transcript("你好", 1000, 0);
        context.push_transcript("  你好  ", 1200, 0); // trim 后与上一条相同 → 丢弃
        context.push_transcript("再见", 1400, 0);
        let entries = context.recent_transcripts(usize::MAX);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].text, "你好");
        assert_eq!(entries[1].text, "再见");
        assert_eq!(entries[1].audio_ts_ms, 1400);
    }

    #[test]
    fn transcript_evicts_by_count_then_chars() {
        let mut context = LiveContext::new();
        for i in 0..(MAX_TRANSCRIPTS + 10) {
            context.push_transcript(&format!("第{i}句"), i as i64 * 1000, 0);
        }
        assert_eq!(context.transcript_count(), MAX_TRANSCRIPTS);
        let entries = context.recent_transcripts(usize::MAX);
        assert_eq!(entries[0].text, format!("第{}句", 10)); // 最旧的 10 条被淘汰
        assert_eq!(
            entries.last().unwrap().text,
            format!("第{}句", MAX_TRANSCRIPTS + 9)
        );

        // 塞入接近字符上限的超长句：条数上限先触发，字符上限再把旧句挤光
        let long = "长".repeat(MAX_TRANSCRIPT_CHARS - 1);
        context.push_transcript(&long, 0, 0);
        let entries = context.recent_transcripts(usize::MAX);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].text, long);
    }

    #[test]
    fn reset_for_room_clears_transcripts() {
        let mut context = LiveContext::new();
        context.push_transcript("你好", 0, 0);
        context.reset_for_room(2303412);
        assert_eq!(context.transcript_count(), 0);
        assert_eq!(context.recent_transcripts(usize::MAX).len(), 0);
    }
}
