//! 工具规格与结果类型。
//!
//! 描述是写给模型看的：说清"何时用、何时别用"，而不是复述参数名。

use serde::Serialize;

/// 工具风险等级，决定三档权限模式下是否需要用户确认。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Risk {
    /// 只读：任何模式都直接放行
    Read,
    /// 写操作但不产生公开内容、不花钱：完全访问与自主模式直通
    Write,
    /// 花钱或产生对外公开内容：自主模式需确认
    Costly,
    /// 不可逆的数据删除：自主模式需确认
    Destructive,
}

impl Risk {
    pub fn as_str(self) -> &'static str {
        match self {
            Risk::Read => "read",
            Risk::Write => "write",
            Risk::Costly => "costly",
            Risk::Destructive => "destructive",
        }
    }

    /// 该风险在给定权限模式下是否需要用户确认
    pub fn needs_confirmation(self, mode: crate::ai::policy::PermissionMode) -> bool {
        use crate::ai::policy::PermissionMode;
        match mode {
            PermissionMode::Full => false,
            PermissionMode::Autonomous => matches!(self, Risk::Costly | Risk::Destructive),
            PermissionMode::ConfirmAll => self != Risk::Read,
        }
    }
}

/// 单个工具的完整规格：MCP 的 tools/list 直接序列化它。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSpec {
    /// 工具名，snake_case，如 `danmaku_send`
    pub name: &'static str,
    /// 一句话说明用途
    pub title: &'static str,
    /// 写给模型看的详细描述：何时用、何时别用、返回什么
    pub description: &'static str,
    pub risk: Risk,
    /// 参数 JSON Schema
    pub input_schema: serde_json::Value,
}

/// 结构化错误：让模型知道下一步该做什么，而不是只看到一句 Rust 报错文本。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolError {
    /// 机器可读错误码，见下方常量
    pub code: String,
    /// 人类可读说明
    pub message: String,
    /// 给模型的可执行建议
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    /// 是否值得原样重试（网络抖动等）
    pub retryable: bool,
    /// 需要用户确认时携带，可带同一 id 重试
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confirmation_id: Option<String>,
}

impl ToolError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            hint: None,
            retryable: false,
            confirmation_id: None,
        }
    }

    pub fn with_hint(mut self, hint: impl Into<String>) -> Self {
        self.hint = Some(hint.into());
        self
    }

    pub fn confirmation(mut self, id: impl Into<String>) -> Self {
        self.confirmation_id = Some(id.into());
        self
    }

    /// 未登录：绝大多数写操作的前置条件
    pub fn not_logged_in() -> Self {
        Self::new("NOT_LOGGED_IN", "当前未登录 B 站账号")
            .with_hint("调用 account_list 查看可用账号并让用户选择，或提示用户在账号页扫码登录")
    }

    /// 未进入直播间
    pub fn not_in_room() -> Self {
        Self::new("NOT_IN_ROOM", "当前未进入任何直播间")
            .with_hint("先调用 room_join 进入直播间，或调用 room_list 确认已保存的房间")
    }

    /// 参数不合法
    pub fn invalid_args(message: impl Into<String>) -> Self {
        Self::new("INVALID_ARGS", message).with_hint("检查参数名与类型是否符合 inputSchema")
    }

    /// 工具名不存在
    pub fn unknown_tool(name: &str) -> Self {
        Self::new("UNKNOWN_TOOL", format!("工具 {name} 不存在"))
            .with_hint("调用 tools/list 获取可用工具名")
    }

    /// 底层业务失败
    pub fn failed(message: impl Into<String>) -> Self {
        Self::new("TOOL_FAILED", message)
    }

    /// 用户拒绝了确认
    pub fn user_denied() -> Self {
        Self::new("USER_DENIED", "用户拒绝了这次操作")
            .with_hint("不要原样重试；先向用户确认意图或换一种做法")
    }

    /// 确认超时
    pub fn confirmation_timeout(id: impl Into<String>) -> Self {
        Self::new("NEEDS_CONFIRMATION", "等待用户确认超时")
            .with_hint("用户未在时限内响应。可用同一 confirmationId 重试，用户界面上仍会再次询问")
            .confirmation(id)
    }
}

impl std::fmt::Display for ToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

/// 工具调用结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ToolError>,
    /// 结果被截断时给出提示与续取游标
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<serde_json::Value>,
}

impl ToolResult {
    pub fn ok(data: serde_json::Value) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
            truncated: None,
            cursor: None,
        }
    }

    pub fn fail(error: ToolError) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(error),
            truncated: None,
            cursor: None,
        }
    }

    /// 给 MCP `content[].text` 用的紧凑 JSON（不 pretty，省 token）
    pub fn to_text(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{\"ok\":false}".to_string())
    }
}

/// 工具调用的来源，用于审计区分
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Origin {
    Mcp,
    DebugPanel,
}

impl Origin {
    pub fn as_str(self) -> &'static str {
        match self {
            Origin::Mcp => "mcp",
            Origin::DebugPanel => "debug",
        }
    }
}
