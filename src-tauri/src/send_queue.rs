use crate::bili::api::BiliApiClient;
use crate::bili::credential::BiliCredential;
use crate::bili::wbi::WbiKeyCache;
use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex as TokioMutex};
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
        self.0.priority == other.0.priority
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
        (self.0.priority as u8).cmp(&(other.0.priority as u8))
    }
}

/// 发送结果
#[derive(Debug)]
pub enum SendResult {
    Success,
    Error(String),
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
        .send_danmaku(item.room_id, &item.message, None, None, 0, None)
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
