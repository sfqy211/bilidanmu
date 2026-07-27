# 项目介绍

BiliDanmu 是一款面向 B 站（bilibili）直播场景的 **Windows 桌面端弹幕客户端**，基于 [Tauri 2](https://tauri.app/) + [React 18](https://react.dev/) 构建。它把直播间里最常用的弹幕收发、账号管理、自动互动、直播播放、语音转字幕、AI 助手等功能整合到一个轻量、统一、原生感强的桌面窗口中。

## 项目链接

| 链接 | 地址 |
| --- | --- |
| GitHub 仓库 | <https://github.com/sfqy211/bilidanmu> |
| 下载发布版 | <https://github.com/sfqy211/bilidanmu/releases> |
| 反馈 Issue | <https://github.com/sfqy211/bilidanmu/issues> |

## 为什么选择 BiliDanmu

| 场景 | 传统方式 | BiliDanmu 的方式 |
| --- | --- | --- |
| 看弹幕 | 浏览器打开直播间，标签页多、占用高 | 独立桌面窗口，轻量常驻，可透传 |
| 多账号 | 反复退出/登录，浏览器多开 | 多账号管理，弹幕窗口内一键切换 |
| 自动互动 | 脚本风险高、易失效 | 内置自动发送/点赞，配置化、可视化 |
| 听直播 | 必须打开网页播放画面 | 纯音频流播放，低带宽、后台运行 |
| 字幕 | 无 | 本地流式语音转字幕，实时叠加 |
| AI 互动 | 无 | 对接 AstrBot，弹幕问答、自动总结 |

## 核心定位

- **轻量**：基于 Tauri 2，安装包小、内存占用远低于 Electron 方案。
- **原生**：自定义标题栏、系统托盘、窗口 Dock 折叠、透传，贴合 Windows 桌面体验。
- **可扩展**：前端 React + 后端 Rust，前后端分离，功能模块化。
- **开源**：基于 [GNU AGPLv3](https://www.gnu.org/licenses/agpl-3.0.html) 开源，欢迎参与贡献。

## 技术栈一览

| 层 | 技术 |
| --- | --- |
| 桌面框架 | Tauri 2 |
| 前端 | React 18 + TypeScript + Vite 7 |
| 状态管理 | Zustand 5 |
| 样式 | TailwindCSS 3 + shadcn/ui + Lucide React 图标 |
| 后端 | Rust（reqwest、tokio-tungstenite、brotli、flate2、sherpa-onnx、symphonia） |
| 音频播放 | mpegts.js（FLV → fMP4 → MSE） |
| 持久化 | SQLite（rusqlite）+ tauri-plugin-store |

想立即上手？请继续阅读 [安装与启动](/guide/install)。
