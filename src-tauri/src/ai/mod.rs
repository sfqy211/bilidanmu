//! AI 工具层：把应用能力封装成模型可调用的意图级工具。
//!
//! 与前端 IPC 命令层并列，两者共用同一批底层实现——这里不复制业务逻辑，
//! 只做参数校验、风险分级、确认通道、限流与 AI 日志记录。
//!
//! 唯一入口是 [`dispatch::call_tool`]，MCP server 调它。

pub mod audit;
pub mod commands;
pub mod confirm;
pub mod context;
pub mod dispatch;
pub mod policy;
pub mod registry;
pub mod spec;
pub mod tools;
