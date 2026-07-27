# 项目结构

BiliDanmu 的代码分为前端（`src/`）与后端（`src-tauri/`）两部分。

## 顶层目录

```text
bilidanmu/
├── src/                # 前端 (React + TypeScript)
├── src-tauri/          # 后端 (Rust)
├── docs/               # 项目文档
├── scripts/            # 构建与辅助脚本
├── dist/               # 前端构建产物
├── reference/          # 参考项目
├── package.json        # 前端依赖与脚本
├── vite.config.ts      # Vite 配置
├── tailwind.config.ts  # TailwindCSS 配置
└── tsconfig.json       # TypeScript 配置
```

## 前端结构 (`src/`)

```text
src/
├── pages/              # 页面
│   ├── RoomPage        # 房间列表页
│   ├── DanmakuPage     # 弹幕页
│   ├── DrawerPage      # 抽屉页
│   ├── AccountPage     # 账号页
│   ├── AIPage          # AI 助手页
│   └── SettingsPage    # 设置页
├── components/         # 组件
│   ├── danmaku/        # 弹幕相关组件
│   ├── layout/         # 布局组件
│   ├── settings/       # 设置相关组件
│   ├── ui/             # 通用 UI 组件 (shadcn/ui)
│   ├── DockCollapsedBar.tsx  # Dock 折叠条
│   └── ErrorBoundary.tsx     # 错误边界
├── hooks/              # React Hooks
├── stores/             # Zustand 状态管理
├── lib/                # 工具库（Tauri IPC 封装等）
├── types/              # TypeScript 类型定义
├── assets/             # 静态资源（图标等）
├── App.tsx             # 应用入口
├── main.tsx            # React 挂载入口
├── router.tsx          # 路由配置
└── index.css           # 全局样式
```

## 后端结构 (`src-tauri/`)

```text
src-tauri/
├── src/
│   ├── bili/           # B 站协议实现
│   │   ├── api.rs      # API 客户端
│   │   ├── buvid.rs    # buvid 生成
│   │   ├── credential.rs # 凭证解析
│   │   ├── protocol.rs # 协议解析
│   │   ├── wbi.rs      # WBI 签名
│   │   └── ws_client.rs # WebSocket 客户端
│   ├── commands/       # Tauri IPC 命令
│   │   ├── auth.rs     # 账号命令
│   │   ├── room.rs     # 房间命令
│   │   ├── danmaku.rs  # 弹幕命令
│   │   ├── ai_proxy.rs # AI 代理命令
│   │   ├── settings.rs # 设置命令
│   │   ├── stt.rs      # 语音识别命令
│   │   ├── proxy.rs    # 代理命令
│   │   ├── dock.rs     # Dock 命令（前端处理）
│   │   ├── download.rs # 下载命令
│   │   ├── log.rs      # 日志命令
│   │   ├── message_template.rs # 消息模板命令
│   │   ├── selections.rs # 选项持久化命令
│   │   ├── update.rs   # 更新检查命令
│   │   └── websocket.rs # WebSocket 命令
│   ├── models/         # 数据模型
│   ├── stt/            # 语音识别模块
│   │   ├── mod.rs      # SttManager
│   │   ├── pipeline.rs # 识别管道
│   │   └── flv_demux.rs # FLV 解复用
│   ├── proxy/          # 本地 HTTP 代理
│   │   └── stream_proxy.rs
│   ├── tray.rs         # 系统托盘
│   ├── window_dock.rs  # 窗口 Dock
│   └── lib.rs          # 应用入口 + AppState
├── icons/              # 应用图标
├── Cargo.toml          # Rust 依赖
└── tauri.conf.json     # Tauri 配置
```

## 关键模块

| 模块 | 位置 | 职责 |
| --- | --- | --- |
| 弹幕流 | `src/hooks/useDanmakuStream.ts` | 管理 WebSocket 连接与弹幕数据 |
| 自动发送 | `src/hooks/useAutoSend.ts` | 自动发送弹幕逻辑 |
| 自动点赞 | `src/hooks/useAutoLike.ts` | 自动点赞逻辑 |
| 音频播放 | `src/hooks/useAudioPlayer.ts` | 直播音频播放控制 |
| 语音转字幕 | `src/hooks/useSttTranscript.ts` | 字幕叠加驱动 |
| 主题 | `src/hooks/useTheme.ts` | 主题切换与跟随系统 |
| 窗口 Dock | `src/hooks/useWindowDock.ts` | 窗口折叠状态 |
| 图片代理 | `src/hooks/useProxyImage.ts` | 图片代理加载 |
| 更新检查 | `src/hooks/useUpdateCheck.ts` | 版本更新检查 |
| B 站协议 | `src-tauri/src/bili/` | API、WebSocket、WBI 签名 |
| IPC 命令 | `src-tauri/src/commands/` | 前端调用的后端接口 |
| 语音识别 | `src-tauri/src/stt/` | FLV 解复用、AAC 解码、流式识别 |
| 本地代理 | `src-tauri/src/proxy/` | HTTP 流代理，绕过 CORS |
| 系统托盘 | `src-tauri/src/tray.rs` | 托盘图标与菜单 |
| 窗口 Dock | `src-tauri/src/window_dock.rs` | 窗口折叠 / 展开 |
