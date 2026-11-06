//! MCP 鉴权 token。
//!
//! 首次启动生成一个随机 token 存进 `app_metadata`，AIPage 显示并允许复制。
//! 只绑 127.0.0.1 还不足以挡住同机其它进程，所以 token 是必需的。

use crate::selections_store;
use crate::AppState;

pub const TOKEN_KEY: &str = "aiMcpToken";

/// 读取现有 token，没有就生成一个并落盘。
pub fn ensure_token(state: &AppState) -> Result<String, String> {
    let existing = selections_store::load_values(state, &[TOKEN_KEY.to_string()])
        .ok()
        .and_then(|mut map| map.remove(TOKEN_KEY))
        .and_then(|value| value.as_str().map(|text| text.to_string()));

    if let Some(token) = existing.filter(|token| !token.is_empty()) {
        return Ok(token);
    }

    let token = generate();
    let mut entries = serde_json::Map::new();
    entries.insert(TOKEN_KEY.to_string(), serde_json::json!(token));
    selections_store::save_values(state, &entries)?;
    Ok(token)
}

/// 重新生成 token（旧 token 立即失效）。
pub fn regenerate(state: &AppState) -> Result<String, String> {
    let token = generate();
    let mut entries = serde_json::Map::new();
    entries.insert(TOKEN_KEY.to_string(), serde_json::json!(token.clone()));
    selections_store::save_values(state, &entries)?;
    Ok(token)
}

fn generate() -> String {
    // 两段 UUID v4 拼起来，32 个十六进制字符，足够本地鉴权
    let first = uuid::Uuid::new_v4().simple().to_string();
    let second = uuid::Uuid::new_v4().simple().to_string();
    format!("{}{}", &first[..16], &second[..16])
}
