//! 三档权限模式。
//!
//! 模式存在 `app_metadata` 的 `aiPermissionMode` 键里，由 AIPage 切换。
//! 默认 `autonomous`：只读与普通写直通，花钱/不可逆操作才问。

use serde::Serialize;

/// AI 工具调用的权限模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionMode {
    /// 变更前确认：任何非只读操作都先询问
    ConfirmAll,
    /// 自主模式：在有风险时询问（Costly / Destructive）
    Autonomous,
    /// 完全访问：全部自动执行
    Full,
}

impl PermissionMode {
    pub fn as_str(self) -> &'static str {
        match self {
            PermissionMode::ConfirmAll => "confirmAll",
            PermissionMode::Autonomous => "autonomous",
            PermissionMode::Full => "full",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "confirmAll" | "confirm_all" => PermissionMode::ConfirmAll,
            "full" => PermissionMode::Full,
            _ => PermissionMode::Autonomous,
        }
    }

    /// 前端展示用的中文说明
    pub fn label(self) -> &'static str {
        match self {
            PermissionMode::ConfirmAll => "变更前确认",
            PermissionMode::Autonomous => "自主模式",
            PermissionMode::Full => "完全访问",
        }
    }
}

pub const PERMISSION_MODE_KEY: &str = "aiPermissionMode";
pub const MCP_ENABLED_KEY: &str = "aiMcpEnabled";

/// 读取当前权限模式；键缺失或读取失败时回落到默认的自主模式。
pub fn load_mode(state: &crate::AppState) -> PermissionMode {
    crate::selections_store::load_values(state, &[PERMISSION_MODE_KEY.to_string()])
        .ok()
        .and_then(|mut map| map.remove(PERMISSION_MODE_KEY))
        .and_then(|value| value.as_str().map(PermissionMode::parse))
        .unwrap_or(PermissionMode::Autonomous)
}

pub fn save_mode(state: &crate::AppState, mode: PermissionMode) -> Result<(), String> {
    let mut entries = serde_json::Map::new();
    entries.insert(
        PERMISSION_MODE_KEY.to_string(),
        serde_json::Value::String(mode.as_str().to_string()),
    );
    crate::selections_store::save_values(state, &entries)
}

/// MCP 服务是否应在启动时拉起。默认 true：客户端配置一次长期有效。
pub fn load_mcp_enabled(state: &crate::AppState) -> bool {
    crate::selections_store::load_values(state, &[MCP_ENABLED_KEY.to_string()])
        .ok()
        .and_then(|mut map| map.remove(MCP_ENABLED_KEY))
        .and_then(|value| value.as_bool())
        .unwrap_or(true)
}

pub fn save_mcp_enabled(state: &crate::AppState, enabled: bool) -> Result<(), String> {
    let mut entries = serde_json::Map::new();
    entries.insert(MCP_ENABLED_KEY.to_string(), serde_json::json!(enabled));
    crate::selections_store::save_values(state, &entries)
}
