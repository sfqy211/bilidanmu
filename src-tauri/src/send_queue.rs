use crate::bili::api::BiliApiClient;
use crate::bili::credential::BiliCredential;
use crate::bili::wbi::WbiKeyCache;
use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, Mutex as TokioMutex};
use tokio::time::{sleep, Duration};

/// 发送优先级
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SendPriority {
    Auto = 0,
    Ai = 1,
    Manual = 2,
}

/// 队列中的发送项
pub struct QueueItem {
    pub room_id: u64,
    pub message: String,
    pub priority: SendPriority,
    pub credential: Option<BiliCredential>,
    /// 预留：提示词 ID，后续提示词管理可标记每条消息使用的提示词
    pub prompt_id: Option<String>,
    /// 回执通道：需要知道发送结果的调用方（AI 工具）在这里等。
    /// `None` 表示即发即忘（手动/自动发送的既有行为）。
    pub respond: Option<oneshot::Sender<SendResult>>,
    /// 文字颜色（十进制 RGB），None 用默认白色
    pub color: Option<u32>,
    /// 弹幕模式：1/2/3 滚动、4 底部、5 顶部。None 用滚动
    pub mode: Option<u32>,
    /// dm_type: 0=文字, 1=表情
    pub dm_type: u32,
    /// 表情弹幕的 emoticon_options JSON
    pub emoticon_options: Option<String>,
    /// 入队序号：BinaryHeap 是最大堆，同优先级下按序号倒序取出才是 FIFO
    pub seq: u64,
}

/// 队列事件：普通消息 或 取消信号
enum QueueEvent {
    Item(QueueItem),
    CancelAuto,
}

/// 用于 BinaryHeap 排序的包装
struct OrdItem(QueueItem);

impl PartialEq for OrdItem {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}

impl Eq for OrdItem {}

impl PartialOrd for OrdItem {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for OrdItem {
    fn cmp(&self, other: &Self) -> Ordering {
        // 先比优先级（高的先发），再比序号（小的先发 = FIFO）。
        // 最大堆里 seq 要反向比较，否则先入队的会被压到堆底。
        (self.0.priority as u8)
            .cmp(&(other.0.priority as u8))
            .then_with(|| other.0.seq.cmp(&self.0.seq))
    }
}

/// 发送结果
#[derive(Debug, Clone)]
pub enum SendResult {
    Success,
    Error(String),
}

/// 入队序号自增计数（单调递增即可，无需跨进程唯一）
fn next_seq() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};
    static SEQ: AtomicU64 = AtomicU64::new(0);
    SEQ.fetch_add(1, AtomicOrdering::Relaxed)
}

/// 取消所有 AUTO 优先级的待发送项
fn cancel_auto_items(heap: &mut BinaryHeap<OrdItem>) {
    heap.retain(|item| item.0.priority != SendPriority::Auto);
}

/// 发送队列
pub struct SendQueue {
    tx: mpsc::UnboundedSender<QueueEvent>,
}

impl SendQueue {
    pub fn new(
        proxy_client: reqwest::Client,
        wbi_cache: Arc<TokioMutex<WbiKeyCache>>,
        min_interval_ms: u64,
    ) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        tokio::spawn(run_queue(proxy_client, wbi_cache, rx, min_interval_ms));
        Self { tx }
    }

    /// 入队一条消息
    pub fn enqueue(&self, item: QueueItem) {
        if self.tx.send(QueueEvent::Item(item)).is_err() {
            log::error!("[SendQueue] 队列已关闭，消息丢失");
        }
    }

    /// 取消所有 AUTO 优先级的待发送项
    pub fn cancel_auto(&self) {
        if self.tx.send(QueueEvent::CancelAuto).is_err() {
            log::error!("[SendQueue] 队列已关闭，取消信号丢失");
        }
    }
}

/// 经由发送队列发一条弹幕并等待结果。
///
/// AI 工具走这条路径，从而复用用户设置里的发送间隔与频率限制——
/// 模型不该拥有比界面更快的刷屏能力。
pub async fn send_via_queue(
    state: &crate::AppState,
    room_id: u64,
    message: &str,
    priority: SendPriority,
    color: Option<u32>,
    mode: Option<u32>,
    dm_type: u32,
    emoticon_options: Option<String>,
) -> Result<SendResult, String> {
    let queue = {
        let slot = state.send_queue.lock().await;
        slot.as_ref().map(|queue| queue.tx.clone())
    };

    let Some(tx) = queue else {
        return Err("发送队列尚未就绪，请稍后重试".to_string());
    };

    let credential = crate::commands::get_sending_credential(state).await;
    let (respond, receiver) = oneshot::channel();

    let item = QueueItem {
        room_id,
        message: message.to_string(),
        priority,
        credential,
        prompt_id: None,
        respond: Some(respond),
        color,
        mode,
        dm_type,
        emoticon_options,
        seq: next_seq(),
    };

    if tx.send(QueueEvent::Item(item)).is_err() {
        return Err("发送队列已关闭".to_string());
    }

    // 队列按发送间隔串行处理，等待上限放宽到 30s（含限流等待）
    match tokio::time::timeout(Duration::from_secs(30), receiver).await {
        Ok(Ok(result)) => Ok(result),
        Ok(Err(_)) => Err("发送队列未能返回结果".to_string()),
        Err(_) => Err("发送排队超时：当前发送频率受限，请稍后再试".to_string()),
    }
}

/// 后台队列处理循环
async fn run_queue(
    proxy_client: reqwest::Client,
    wbi_cache: Arc<TokioMutex<WbiKeyCache>>,
    mut rx: mpsc::UnboundedReceiver<QueueEvent>,
    min_interval_ms: u64,
) {
    let interval = Duration::from_millis(min_interval_ms.max(1000));
    let mut heap: BinaryHeap<OrdItem> = BinaryHeap::new();

    loop {
        // 等待第一条事件
        let first = match rx.recv().await {
            Some(event) => event,
            None => break,
        };

        // 处理第一条事件
        match first {
            QueueEvent::CancelAuto => {
                cancel_auto_items(&mut heap);
                continue;
            }
            QueueEvent::Item(item) => heap.push(OrdItem(item)),
        }

        // 消积攒的事件
        while let Ok(event) = rx.try_recv() {
            match event {
                QueueEvent::CancelAuto => {
                    cancel_auto_items(&mut heap);
                }
                QueueEvent::Item(item) => heap.push(OrdItem(item)),
            }
        }

        // 逐条发送
        while let Some(item) = heap.pop() {
            let item = item.0;
            let api = BiliApiClient::new(
                proxy_client.clone(),
                item.credential.clone(),
                wbi_cache.clone(),
            );
            let result = send_one(&api, &item).await;

            // 先回执再打日志：等待方拿到结果就能立刻返回，不必等限流间隔
            if let Some(respond) = item.respond {
                let _ = respond.send(result.clone());
            }

            match &result {
                SendResult::Success => {
                    log::info!("[SendQueue] 发送成功: room={} msg={}", item.room_id, item.message);
                }
                SendResult::Error(e) => {
                    log::error!("[SendQueue] 发送失败: room={} msg={} err={}", item.room_id, item.message, e);
                }
            }

            // 限流等待
            sleep(interval).await;

            // 等待期间积攒的事件
            while let Ok(event) = rx.try_recv() {
                match event {
                    QueueEvent::CancelAuto => {
                        cancel_auto_items(&mut heap);
                    }
                    QueueEvent::Item(item) => heap.push(OrdItem(item)),
                }
            }
        }
    }
}

/// 发送单条弹幕
async fn send_one(api_client: &BiliApiClient, item: &QueueItem) -> SendResult {
    match api_client
        .send_danmaku(
            item.room_id,
            &item.message,
            item.color,
            item.mode,
            item.dm_type,
            item.emoticon_options.clone(),
        )
        .await
    {
        Ok(resp) => {
            if resp.code == 0 {
                SendResult::Success
            } else {
                SendResult::Error(resp.message)
            }
        }
        Err(e) => SendResult::Error(e),
    }
}
