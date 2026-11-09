//! 弹幕共享上报模块。
//!
//! 把本机在 bilidanmu 里采集到的弹幕推送到中心归档服务（danmu_vue），
//! 由中心按 B 站消息 ID 跨节点去重后统一存储与展示。

pub mod client;

pub use client::{IngestClient, IngestConfig, IngestStats};
