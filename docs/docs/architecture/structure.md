# 项目结构

BiliDanmu 的代码分为前端（`src/`）与后端（`src-tauri/`）两部分，另外包含文档站（`docs/`）与测试脚本（`tests/`）。

## 顶层目录

```text
bilidanmu/
├── src/                # 前端 (React + TypeScript)
├── src-tauri/          # 后端 (Rust)
├── docs/               # Docusaurus 文档站（docs/docs 是站点内容，docs/design 是功能设计记录）
├── tests/              # 测试手册与场景脚本
├── scripts/            # 构建与辅助脚本（bump-version.ps1）
├── design/             # 落地页/视觉探索素材
├── promo/              # 宣传片工程
├── dist/               # 前端构建产物
├── package.json        # 前端依赖与脚本
├── vite.config.ts      # Vite 配置（root=src, outDir=../dist）
├── tailwind.config.ts  # TailwindCSS 配置
└── tsconfig.json       # TypeScript 配置
```

## 前端结构 (`src/`)

```text
src/
├── pages/              # 页面（与 router.tsx 一一对应）
│   ├── RoomPage.tsx            # /rooms 房间列表
│   ├── RoomAddPage.tsx         # /rooms/add 添加直播间
│   ├── AccountPage.tsx         # /accounts 账号
│   ├── AIPage.tsx              # /ai 占位页（开发中）
│   ├── SettingsPage.tsx        # /settings 设置
│   ├── DanmakuPage.tsx         # /danmaku/:roomId 弹幕窗口
│   ├── ListenHomePage.tsx      # /listen 听视频首页
│   ├── VideoAddPage.tsx        # /listen/add 添加视频
│   ├── WatchLaterPage.tsx      # /listen/watchlater 稍后再看
│   ├── ListenFavPage.tsx       # /listen/fav/:mediaId 收藏夹内容
│   ├── VideoPlayerPage.tsx     # /listen/video/:bvid 播放页
│   └── VideoCommentsPage.tsx   # /listen/video/:bvid/comments 评论区
├── components/
│   ├── danmaku/        # 弹幕窗组件（消息行、面板、切换器、字幕叠加层）
│   ├── layout/         # WorkspaceLayout / AppLayout / 侧栏 / 标题栏 / 页头
│   ├── listen/         # 迷你播放条、播放控制、播放列表树、字幕面板、列表页
│   ├── settings/       # 八个设置分区组件 + 控件原语 + 常量
│   ├── rooms/          # 收藏管理对话框
│   ├── add/            # 添加直播间/视频共用的搜索页
│   ├── ui/             # 通用 UI（ProxiedImage、对话框、Select 等）
│   ├── DockCollapsedBar.tsx  # 吸附收起条
│   └── ErrorBoundary.tsx     # 错误边界
├── hooks/              # React Hooks
├── stores/             # Zustand 状态（auth / room / danmaku / settings / ui / video-audio）
├── lib/                # tauri.ts（IPC 封装）、theme / visual-theme / brand-theme、app-history 等
├── types/              # TypeScript 类型定义
├── assets/             # 静态资源（图标等）
├── App.tsx             # 启动恢复 + 跨窗口事件
├── main.tsx            # React 挂载入口
├── router.tsx          # 路由配置
└── index.css           # 全局样式与设计 token
```

## 后端结构 (`src-tauri/`)

```text
src-tauri/
├── src/
│   ├── bili/           # B 站协议实现
│   │   ├── api.rs          # API 客户端（房间/视频/评论/礼物等）
│   │   ├── buvid.rs        # buvid 生成
│   │   ├── credential.rs   # 凭证解析与校验
│   │   ├── heartbeat.rs    # Web / 移动端观看心跳
│   │   ├── mock.rs         # 虚拟直播间（BILIDANMU_MOCK=1）
│   │   ├── pb.rs           # protobuf wire 子集解码（SEND_GIFT_V2）
│   │   ├── protocol.rs     # 16 字节包头、解压、消息解析
│   │   ├── wbi.rs          # WBI 签名
│   │   └── ws_client.rs    # WebSocket 客户端（认证、心跳、重连、服务器优选）
│   ├── commands/       # Tauri IPC 命令
│   │   ├── auth.rs / room.rs / danmaku.rs / gift.rs / video.rs
│   │   ├── settings.rs / selections.rs / message_template.rs
│   │   ├── proxy.rs / stt.rs / websocket.rs
│   │   └── update.rs / download.rs / log.rs
│   ├── models/         # 数据模型（account / room / message / settings / stream / video / gift / response）
│   ├── stt/            # 语音识别
│   │   ├── mod.rs          # SttManager 生命周期
│   │   ├── pipeline.rs     # FLV 解复用 → AAC 解码 → 重采样 → sherpa-onnx
│   │   └── flv_demux.rs    # FLV 解复用器
│   ├── proxy/          # 本地 HTTP 代理
│   │   ├── mod.rs
│   │   └── stream_proxy.rs # 直播流 + 视频流双槽，STT 字节流 tee
│   ├── db.rs               # SQLite 打开与建表/迁移
│   ├── credential_store.rs # 账号凭证（tauri-plugin-store）
│   ├── settings_store.rs   # 设置读写（SQLite app_metadata）
│   ├── selections_store.rs # 轻量选项读写（SQLite app_metadata）
│   ├── room_store.rs       # 房间表读写
│   ├── emoticon_store.rs   # 表情包/表情/收藏
│   ├── message_template_store.rs # 快捷消息
│   ├── send_queue.rs       # 发送队列（manual / ai / auto 优先级）
│   ├── shortcuts.rs        # 全局快捷键注册与分发
│   ├── tray.rs             # 系统托盘
│   ├── window_dock.rs      # 贴边吸附收起
│   ├── window_state.rs     # 弹幕窗口几何持久化
│   ├── window_stealth.rs   # 隐身模式
│   ├── screen_luminance.rs # 背景亮度采样
│   ├── focus.rs            # 前台窗口焦点保存/恢复
│   ├── lib.rs              # 应用入口 + AppState + 插件/事件注册
│   └── main.rs             # 可执行入口
├── capabilities/default.json # 权限（windows: main, danmaku）
├── icons/                  # 应用图标
├── Cargo.toml              # Rust 依赖与 gift-send feature
└── tauri.conf.json         # Tauri 配置
```

## 页面与路由

`src/router.tsx` 中的路由与页面对应关系：

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/rooms` | `RoomPage` | 房间列表（默认页，`/` 重定向到这里） |
| `/rooms/add` | `RoomAddPage` | 添加直播间 |
| `/accounts` | `AccountPage` | 账号管理 |
| `/ai` | `AIPage` | 占位页 |
| `/settings` | `SettingsPage` | 设置（八个分类） |
| `/listen` | `ListenHomePage` | 收藏夹 + 稍后再看 |
| `/listen/add` | `VideoAddPage` | 搜索 / BV 号添加 |
| `/listen/search` | — | 重定向到 `/listen/add` |
| `/listen/watchlater` | `WatchLaterPage` | 稍后再看列表 |
| `/listen/fav/:mediaId` | `ListenFavPage` | 收藏夹内容 |
| `/listen/video/:bvid` | `VideoPlayerPage` | 播放页 |
| `/listen/video/:bvid/comments` | `VideoCommentsPage` | 评论区 |
| `/danmaku/:roomId` | `DanmakuPage` | 弹幕窗口（不在主布局内） |

`/rooms`、`/accounts`、`/ai`、`/settings`、`/listen*` 都嵌套在 `AppLayout` 里，共用标题栏、侧栏与迷你播放条。

## 关键模块

| 模块 | 位置 | 职责 |
| --- | --- | --- |
| 弹幕流 | `src/hooks/useDanmakuStream.ts` | 管理 WebSocket 连接与弹幕数据 |
| 循环发送 | `src/hooks/useAutoSend.ts` | 自动发送会话状态 |
| 自动点赞 | `src/hooks/useAutoLike.ts` | 自动点赞会话状态 |
| 直播音频 | `src/hooks/useAudioPlayer.ts` | mpegts.js 播放与重连 |
| 听视频 | `src/stores/video-audio-store.ts` | 单例 `<audio>` 队列播放 |
| 语音转字幕 | `src/hooks/useSttTranscript.ts` | 字幕缓冲与同步偏移 |
| 背景跟随 | `src/hooks/useBackgroundTheme.ts` | 轮询亮度并覆盖主题 |
| 吸附 | `src/hooks/useWindowDock.ts` | 订阅 `dock-changed`，驱动收起条 |
| 图片代理 | `src/hooks/useProxyImage.ts` | L1 内存缓存 + L2 SQLite |
| B 站协议 | `src-tauri/src/bili/` | API、WebSocket、WBI 签名、protobuf |
| IPC 命令 | `src-tauri/src/commands/` | 前端调用的后端接口 |
| 语音识别 | `src-tauri/src/stt/` | FLV 解复用、AAC 解码、流式识别 |
| 本地代理 | `src-tauri/src/proxy/` | HTTP 流代理，绕过 CORS |
| 系统托盘 | `src-tauri/src/tray.rs` | 托盘图标与菜单 |
| 窗口吸附 | `src-tauri/src/window_dock.rs` | 折叠 / 展开 / 退出 |
| 窗口几何 | `src-tauri/src/window_state.rs` | 弹幕窗口位置与尺寸保存 / 恢复 |
| 虚拟直播间 | `src-tauri/src/bili/mock.rs` | 本地弹幕服务器 + HTTP 控制面 |
