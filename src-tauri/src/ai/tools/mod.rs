//! 工具实现按域分文件，每个函数接收已解析的参数并返回 `Result<Value, ToolError>`。
//!
//! 约定：
//! - 参数解析集中在 [`args`] 模块，越界/缺字段一律 `INVALID_ARGS`
//! - 业务错误用 [`ToolError::failed`]，前置条件用专门构造器
//! - 不改动 UI 状态，除非该工具本就是"改变姿态"类操作

pub mod account;
pub mod app;
pub mod danmaku;
pub mod gift;
pub mod live;
pub mod room;
pub mod settings;
pub mod video;

use crate::ai::spec::ToolError;
use crate::bili::api::BiliApiClient;
use crate::bili::credential::BiliCredential;
use crate::AppState;

/// 构造 API 客户端。工具层拿到的是裸 `&AppState`，而命令层收 `State<'_, AppState>`，
/// 类型不同但业务实现完全一样——两个入口共用同一个 `BiliApiClient`。
pub fn api_client(state: &AppState, credential: Option<BiliCredential>) -> BiliApiClient {
    BiliApiClient::new(
        state.proxy_client.clone(),
        credential,
        state.wbi_cache.clone(),
    )
}

/// 用主凭据构造客户端（读操作用）
pub async fn api_with_main(state: &AppState) -> BiliApiClient {
    let credential = state.credential.lock().await.clone();
    api_client(state, credential)
}

/// 用发送凭据构造客户端（写操作用，会回落到主凭据）
pub async fn api_with_sending(state: &AppState) -> BiliApiClient {
    let credential = crate::commands::get_sending_credential(state).await;
    api_client(state, credential)
}

/// 当前登录的账号 id（无登录时为 None）
pub fn active_account_id(state: &AppState) -> Option<String> {
    state
        .active_account_id
        .lock()
        .ok()
        .and_then(|value| value.clone())
}

/// 当前所在直播间（从直播间上下文缓冲读取）
pub fn current_room_id(state: &AppState) -> Option<u64> {
    state
        .live_context
        .lock()
        .ok()
        .and_then(|context| context.room_id)
}

/// 参数读取助手：把 serde_json::Value 的安全取值与错误信息统一起来。
pub mod args {
    use super::ToolError;

    pub fn string(args: &serde_json::Value, key: &str) -> Result<String, ToolError> {
        args.get(key)
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .ok_or_else(|| ToolError::invalid_args(format!("缺少字符串参数 {key}")))
    }

    pub fn opt_string(args: &serde_json::Value, key: &str) -> Option<String> {
        args.get(key)
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
    }

    pub fn u64_required(args: &serde_json::Value, key: &str) -> Result<u64, ToolError> {
        args.get(key)
            .and_then(|value| value.as_u64())
            .ok_or_else(|| ToolError::invalid_args(format!("缺少整数参数 {key}")))
    }

    pub fn opt_u64(args: &serde_json::Value, key: &str) -> Option<u64> {
        args.get(key).and_then(|value| value.as_u64())
    }

    pub fn opt_u32(args: &serde_json::Value, key: &str) -> Option<u32> {
        args.get(key)
            .and_then(|value| value.as_u64())
            .map(|value| value as u32)
    }

    pub fn opt_bool(args: &serde_json::Value, key: &str) -> Option<bool> {
        args.get(key).and_then(|value| value.as_bool())
    }

    pub fn bool_or(args: &serde_json::Value, key: &str, default: bool) -> bool {
        opt_bool(args, key).unwrap_or(default)
    }

    /// 取整数并夹到区间内，用于分页大小这类"越界就收敛"的参数
    pub fn capped(args: &serde_json::Value, key: &str, default: u64, min: u64, max: u64) -> u64 {
        args.get(key)
            .and_then(|value| value.as_u64())
            .unwrap_or(default)
            .clamp(min, max)
    }
}

/// 把错误文本里明显的前置条件失败识别成专门错误码，让模型知道该先做什么。
pub fn classify_business_error(error: String) -> ToolError {
    let lowered = error.to_lowercase();
    if lowered.contains("未登录") || lowered.contains("not logged") || lowered.contains("未登录") {
        return ToolError::not_logged_in();
    }
    if lowered.contains("礼物打赏功能未随此构建启用") {
        return ToolError::new(
            "FEATURE_DISABLED",
            "本构建未启用礼物打赏功能（官方发布默认关闭，涉及真实扣费）",
        )
        .with_hint("这是编译期开关，无法在运行时打开；不要重试送礼");
    }
    ToolError::failed(error)
}
