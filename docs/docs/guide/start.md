# 项目介绍

BiliDanmu 是一款面向 B 站（bilibili）直播与视频音频场景的 **桌面客户端**，基于 [Tauri 2](https://tauri.app/) + [React 18](https://react.dev/) 构建。它把直播间里最常用的弹幕收发、账号管理、自动互动、直播播放、语音转字幕，以及"把视频当音乐听"整合到一个轻量、统一、原生感强的桌面窗口中。目前提供 Windows（x64）、macOS（Universal）和 Linux（x64）版本。

## 项目链接

| 链接 | 地址 |
| --- | --- |
| 官网 / 文档站 | <https://sfqy211.github.io/bilidanmu/> |
| GitHub 仓库 | <https://github.com/sfqy211/bilidanmu> |
| 下载发布版 | <https://github.com/sfqy211/bilidanmu/releases> |
| 反馈 Issue | <https://github.com/sfqy211/bilidanmu/issues> |

## 为什么选择 BiliDanmu

| 场景 | 传统方式 | BiliDanmu 的方式 |
| --- | --- | --- |
| 看弹幕 | 浏览器打开直播间，标签页多、占用高 | 独立桌面窗口，轻量常驻，可透传可隐身 |
| 多账号 | 反复退出/登录，浏览器多开 | 多账号管理，弹幕窗口内一键切换发送账号 |
| 自动互动 | 脚本风险高、易失效 | 内置循环发送/自动点赞，配置化、可视化 |
| 听直播 | 必须打开网页播放画面 | 纯音频流播放，低带宽、后台运行 |
| 字幕 | 无 | 本地流式语音转字幕，实时叠加在弹幕窗上 |
| 听视频 | 网页播放器 | 视频当音乐听：BV 直达、分 P/合集连播、收藏夹即专辑 |

## 核心定位

- **轻量**：基于 Tauri 2，安装包小、内存占用远低于 Electron 方案。
- **原生**：自定义标题栏、系统托盘、窗口贴边收起、透传与隐身，贴合桌面使用习惯。
- **可扩展**：前端 React + 后端 Rust，前后端分离，功能模块化。
- **开源**：基于 [GNU AGPLv3](https://www.gnu.org/licenses/agpl-3.0.html) 开源，欢迎参与贡献。

## 技术栈一览

| 层 | 技术 |
| --- | --- |
| 桌面框架 | Tauri 2 |
| 前端 | React 18 + TypeScript + Vite 7 |
| 状态管理 | Zustand 5 |
| 样式 | TailwindCSS 3 + Radix UI + Lucide React 图标 |
| 后端 | Rust（reqwest、tokio-tungstenite、brotli、flate2、sherpa-onnx、symphonia） |
| 音频播放 | mpegts.js（直播 FLV → fMP4 → MSE）、HTMLAudioElement（听视频） |
| 持久化 | SQLite（rusqlite）+ tauri-plugin-store |

想立即上手？请继续阅读 [安装与启动](/guide/install)。
