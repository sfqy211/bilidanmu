# BiliDanmu

Windows 桌面端 B站直播间弹幕客户端，基于 Tauri 2 + React 18 构建。

## 功能

- Cookie 登录，启动自动恢复
- 房间搜索（主播名 / 房间号 / 链接 / UID），本地持久化
- 文字弹幕发送、表情弹幕发送
- 独轮车循环发送（多行消息、可调间隔、切房自动停止）
- WebSocket 弹幕流实时接收（弹幕、礼物、进场、醒目留言）
- 弹幕流内联表情渲染（`[表情名]` → 图片）
- 醒目留言真实颜色还原（两段式卡片 + 背景图）
- 系统托盘常驻，窗口关闭最小化到托盘

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri 2 |
| 前端 | React 18 + TypeScript + Vite 7 |
| 状态管理 | Zustand 5 |
| 样式 | TailwindCSS 3 |
| 图标 | Lucide React |
| 后端 | Rust (reqwest, tokio-tungstenite, brotli, flate2) |
| 持久化 | SQLite (rusqlite) + tauri-plugin-store |

## 开发

### 环境要求

- Node.js 18+
- Rust (rustup)
- Windows 10+（WebView2 运行时）

### 安装依赖

```bash
npm install
```

### 启动开发

```bash
npm run dev
```

启动 Vite 前端（localhost:3000）+ Tauri 桌面窗口。

### 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 完整开发模式（前端 + Tauri） |
| `npm run dev:renderer` | 仅前端（Vite） |
| `npm run typecheck` | TypeScript 类型检查 |
| `cargo check` (在 src-tauri/) | Rust 编译检查 |
| `npm run build` | 构建发布包 |

## 项目结构

```
src/                          前端 (React + TypeScript)
├── pages/                    页面（RoomPage, DanmakuPage, AccountPage, AIPage, SettingsPage）
├── hooks/                    React Hooks（useDanmakuStream, useScheduler, useAuth...）
├── stores/                   Zustand 状态管理
├── lib/tauri.ts              Tauri IPC 调用封装
└── types/                    TypeScript 类型定义

src-tauri/                    后端 (Rust)
├── src/bili/                 B站协议实现（API、WebSocket、WBI 签名、协议解析）
├── src/commands/             Tauri IPC 命令处理
├── src/models/               数据模型
└── src/lib.rs                应用入口 + AppState
```

## 截图

<!-- TODO: 添加截图 -->

## 许可

本项目基于 [GNU General Public License v3.0](LICENSE) 开源。

### 参考项目

本项目在开发过程中参考了以下开源项目：

| 项目 | 许可证 |
|------|--------|
| [cc-switch](https://github.com/nichuanfang/cc-switch) | MIT |
| [BLSPAM](https://github.com/ADJazzzz/BLSPAM) | MIT |
| [PiliPlus](https://github.com/lgc2333/PiliPlus) | GPLv3 |
| [simple_live_app](https://github.com/xiaoyaocz/simple_live_app) | MIT |
| [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect) | CC BY-NC 4.0 |
| [bilibili-api](https://github.com/Nemo2011/bilibili-api) | GPLv3 |
| [astrbot_plugin_bilibili_live](https://github.com/aka77777/astrbot_plugin_bilibili_live) | AGPLv3 |

`bilibili-API-collect` 采用 CC BY-NC 4.0 许可（禁止商业使用），本项目的 B 站 API 文档参考自该项目，同样禁止将本项目用于商业用途。
