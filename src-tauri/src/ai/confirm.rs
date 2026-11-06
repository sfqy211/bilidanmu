//! 确认通道：把"需要用户点头"的操作接到主窗口的确认弹窗上。
//!
//! 流程：调度器登记一个待确认项 → emit 事件给主窗口 → 前端弹窗 → 用户决定 →
//! `ai_confirm_response` 命令唤醒等待方。等待超时由调用方处理，本模块只负责
//! 登记与唤醒，不做超时判断。

use std::collections::HashMap;
use tokio::sync::oneshot;

/// 一次待确认的操作
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingConfirmation {
    pub id: String,
    /// 工具名，如 `gift_send`
    pub tool: String,
    /// 弹窗标题
    pub title: String,
    /// 弹窗正文：要向用户交代清楚"要做什么"
    pub message: String,
    /// 风险等级，前端据此决定用危险样式
    pub risk: String,
}

/// 待确认注册表（存于 AppState）
#[derive(Default)]
pub struct ConfirmRegistry {
    waiters: HashMap<String, oneshot::Sender<bool>>,
}

impl ConfirmRegistry {
    /// 登记一个待确认项，返回等待用户决定的 receiver。
    /// 同名 id 重复登记时旧等待方会因 sender 被丢弃而收到 Err。
    pub fn register(&mut self, id: String) -> oneshot::Receiver<bool> {
        let (tx, rx) = oneshot::channel();
        self.waiters.insert(id, tx);
        rx
    }

    /// 用户给出决定：唤醒等待方。返回 false 表示该 id 已超时/不存在。
    pub fn resolve(&mut self, id: &str, approved: bool) -> bool {
        match self.waiters.remove(id) {
            Some(tx) => tx.send(approved).is_ok(),
            None => false,
        }
    }

    /// 丢弃某个等待项（超时清理）
    pub fn discard(&mut self, id: &str) {
        self.waiters.remove(id);
    }
}

/// 生成一个短 id，用于关联请求与用户决定。
pub fn new_confirmation_id() -> String {
    uuid::Uuid::new_v4()
        .simple()
        .to_string()
        .chars()
        .take(12)
        .collect()
}
