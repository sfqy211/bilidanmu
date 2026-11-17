# BiliDanmu

B 站直播弹幕与听视频桌面客户端：把直播间收进一个常驻小窗，也可以只听声音、看实时字幕，或者把视频当播客听。支持 Windows / macOS / Linux。

[下载](https://sfqy211.github.io/bilidanmu/#download) · [文档站](https://sfqy211.github.io/bilidanmu/) · [发布页](https://github.com/sfqy211/bilidanmu/releases) · [使用指南](https://sfqy211.github.io/bilidanmu/guide/quick-start)

## 简介

进入直播间后主窗口可以收起，只留一个置顶的弹幕小窗承载消息与输入框；不打开画面也能播放直播音频，并可选在本地做实时语音转字幕。听视频部分提供收藏夹 / 稍后再看播放列表、字幕跟随、迷你播放条和独立的视频弹幕窗。账号、房间、设置与缓存全部保存在本地 SQLite。

## 主要功能

- **弹幕小窗**：置顶、贴边自动收起、仅输入框、鼠标透传、隐身，透明度与字号可调；单窗口持续切换直播间，托盘常驻。
- **看直播**：多账号登录，观看与发送可使用不同账号；房间列表 / 封面两种视图；三栏消息（礼物 / 弹幕 / 活动）、表情、关键词与用户屏蔽、自动发送与自动点赞、快捷模板。
- **黑听直播**：直播音频流播放；可选的本地实时语音转字幕（sherpa-onnx，不上传音频）。
- **听视频**：BV 号 / 链接 / 关键词搜索 / 收藏夹 / 稍后再看，分 P 与合集、双层队列、字幕逐句高亮跟随、迷你播放条。
- **视频弹幕窗**：与直播弹幕窗共用同一套窗口行为，字幕与视频弹幕共用时间轴，支持点击跳转、拖拽进度与发送弹幕。
- **AI 接入（MCP）**：内置本地 MCP 服务，AI 客户端可读取直播上下文、弹幕、视频字幕与评论，并在三档权限约束下执行发送、整理稍后再看等操作。
- **外观**：浅色 / 深色 / 跟随系统，多套主题预设与自定义强调色，全局快捷键与界面缩放。

功能的完整说明见[功能介绍](https://sfqy211.github.io/bilidanmu/guide/features)。

## 下载

安装包在[下载页](https://sfqy211.github.io/bilidanmu/#download)提供，也可以在[发布页](https://github.com/sfqy211/bilidanmu/releases/latest)按版本查找。

| 平台 | 产物 | 要求 |
| --- | --- | --- |
| Windows x64 | `.exe`（NSIS）/ `.msi` | Windows 10+，需要 WebView2 运行时 |
| macOS Universal | `.dmg` | Intel / Apple Silicon；未签名，首次需右键「打开」 |
| Linux x64 | `.AppImage` | 需要 webkit2gtk 4.1 |

首次安装与登录步骤见[快速开始](https://sfqy211.github.io/bilidanmu/guide/quick-start)。

## 文档

文档站：<https://sfqy211.github.io/bilidanmu/>

- [使用指南](https://sfqy211.github.io/bilidanmu/guide/quick-start)：安装、账号、直播间、弹幕窗、听视频、语音转字幕、AI 接入
- [技术架构](https://sfqy211.github.io/bilidanmu/architecture/overview)：前后端结构、数据流、窗口与协议实现
- [API 参考](https://sfqy211.github.io/bilidanmu/api/ipc)：IPC 命令、事件列表、MCP 工具
- 本地开发约定：`AGENTS.md`；测试手册：`tests/README.md`

## 开发

需要 Node.js 20.19+、Rust stable 与对应平台的 Tauri 系统依赖。前端 UI 与 Rust 协议层都依赖同级的公共仓库 `danmaku-core`，首次开发先准备好：

```bash
git clone https://github.com/sfqy211/danmaku-core.git ../danmaku-core
git -C ../danmaku-core checkout --detach "$(node scripts/shared-core-revision.mjs)"
npm --prefix ../danmaku-core ci
npm --prefix ../danmaku-core run build
npm ci
```

之后常用命令：

```bash
npm run dev          # 桌面端开发
npm run dev:mock     # 带虚拟直播间，无需真实房间
npm run dev:gift     # 开启礼物打赏（编译期特性，官方构建默认关闭）
npm run typecheck    # 前端类型检查
```

Rust 侧在 `src-tauri/` 下运行 `cargo check`。更多命令与提交前验证要求见 `AGENTS.md`。

## 许可

本项目基于 [GNU Affero General Public License v3.0](LICENSE) 开源。

开发过程中参考了 [cc-switch](https://github.com/farion1231/cc-switch)、[BLSPAM](https://github.com/ADJazzzz/BLSPAM)、[PiliPlus](https://github.com/bggRGjQaUbCoE/PiliPlus)、[simple_live_app](https://github.com/xiaoyaocz/dart_simple_live)、[bilibili-api](https://github.com/Nemo2011/bilibili-api)、[fansMedalHelper](https://github.com/XiaoMiku01/fansMedalHelper)、[danmuai](https://github.com/PEPETII/danmuai)、[chatterbox](https://github.com/laplace-live/chatterbox)、[live-moyu](https://github.com/amount-chen/live-moyu)、[JLiverTool](https://github.com/Xinrea/JLiverTool)、[BilibiliApis](https://github.com/cv-cat/BilibiliApis) 等项目。

B 站接口文档参考自 [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)（CC BY-NC 4.0），因此请勿将本项目用于商业用途。
