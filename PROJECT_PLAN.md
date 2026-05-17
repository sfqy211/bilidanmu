# BiliDanmu - B站直播间弹幕发送客户端 项目规划

> 基于 7 个参考项目的深度分析，规划一个B站直播间弹幕发送客户端。

---

## 项目文档

| 文档                             | 内容                                                       |
| -------------------------------- | ---------------------------------------------------------- |
| [架构设计](docs/architecture.md) | 技术栈选型、项目结构、数据流、全局状态、依赖清单           |
| [页面设计](docs/design.md)       | 管理面板（4 个子页面）、弹幕页面、系统托盘的 UI 规范与交互 |
| [API 与实现](docs/api.md)        | B站 API、Tauri IPC 命令汇总、事件列表、核心代码片段        |
| [进度与路线图](docs/roadmap.md)  | 当前进度、各阶段行动清单、未完成项、风险                   |
| [调研记录](docs/research.md)     | v2 API 与仅音频流调研、STT 管道技术调研                  |

---

## 核心需求

| 功能                        | 来源参考                          | 优先级 | 状态 |
| --------------------------- | --------------------------------- | ------ | ---- |
| 直播间文字弹幕发送          | BLSPAM, PiliPlus, bilibili-api    | P0     | ✅   |
| 直播间表情弹幕发送          | BLSPAM, PiliPlus, simple_live_app | P0     | ✅   |
| Cookie 认证                 | 全部项目                          | P0     | ✅   |
| WBI 签名                    | bilibili-api, PiliPlus, astrbot   | P0     | ✅   |
| 二维码登录                  | bilibili-api, PiliPlus            | P1     | ✅   |
| 直播间弹幕接收（WebSocket） | astrbot, bilibili-api, PiliPlus   | P1     | ✅   |
| 弹幕发送间隔/队列控制       | BLSPAM                            | P2     | ✅   |
| 消息模板/收藏夹循环发送     | BLSPAM                            | P2     | ✅   |
| 多直播间支持                | -                                 | P2     | ✅   |
| 系统托盘                    | cc-switch                         | P2     | ✅   |
| 账号移除命令                | -                                 | P2     | ✅   |
| 升级直播流 API 至 v2        | PiliPlus, bilibili-API-collect    | P2     | ✅   |
| 仅音频流拉取与播放          | PiliPlus                          | P2     | ✅   |
| 实时语音转字幕              | PiliPlus, sherpa-onnx             | P2     | ✅   |

---

## 快速参考

### 命令

| 任务                     | 命令                          |
| ------------------------ | ----------------------------- |
| 完整开发（前端 + Tauri） | `npm run dev`                 |
| 仅前端（Vite :3000）     | `npm run dev:renderer`        |
| 前端类型检查             | `npm run typecheck`           |
| Rust 检查                | `cd src-tauri && cargo check` |
| 构建发布                 | `npm run build`               |

### 参考项目

项目 `reference/` 目录中包含以下上游参考：

| 项目                           | 用途                        |
| ------------------------------ | --------------------------- |
| `cc-switch`                    | Tauri 2 + React 架构参考    |
| `BLSPAM`                       | B站 API + 发送逻辑          |
| `PiliPlus`                     | 协议解析 + SC 渲染 + 音频流 |
| `bilibili-API-collect`         | API 文档                    |
| `bilibili-api`                 | Python API 封装             |
| `simple_live_app`              | 多平台直播客户端            |
| `astrbot_plugin_bilibili_live` | 弹幕 WebSocket 插件         |
