//! 本地 MCP server：把 AI 工具层按 Model Context Protocol 暴露给外部客户端。
//!
//! 只实现所需的协议子集（initialize / tools/list / tools/call / ping），
//! 传输用 Streamable HTTP 的 JSON 响应模式（不启用 SSE）。

pub mod handlers;
pub mod jsonrpc;
pub mod server;
pub mod token;

pub use server::McpStatus;
