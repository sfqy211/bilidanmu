# 架构设计

> 技术栈选型、项目结构、数据流与全局状态设计。

---

## 一、技术栈选型

### 方案：Tauri 2 + React 18 + TypeScript

| 层级               | 技术选择              | 理由                                                          |
| ------------------ | --------------------- | ------------------------------------------------------------- |
| **桌面框架**       | Tauri 2               | 3-8 MB 安装包（对比 Electron 150-200 MB），cc-switch 生产验证 |
| **前端框架**       | React 18 + TypeScript | cc-switch 参考项目即 React 18 + Tauri 2，可直接复用架构模式   |
| **UI 组件库**      | shadcn/ui             | cc-switch 已验证与 Tauri 2 配合，可定制性极强，基于 Radix UI  |
| **样式方案**       | TailwindCSS 3         | 当前项目实际使用版本，shadcn/ui 可稳定配合                    |
| **状态管理**       | Zustand               | 轻量极简，cc-switch 已使用，比 Redux/Jotai 更适合此规模项目   |
| **数据请求**       | TanStack Query        | 异步状态管理（API 调用、缓存、重试），cc-switch 已使用        |
| **路由**           | React Router 7        | React 生态标准，成熟稳定                                      |
| **构建工具**       | Vite 7                | 当前项目实际使用版本，开发体验与生态兼容正常                  |
| **Rust HTTP**      | reqwest               | Tauri 异步 HTTP 客户端，cc-switch 已引入                      |
| **Rust WebSocket** | tokio-tungstenite     | 异步 WS 客户端，适合弹幕流长连接                              |
| **Rust 压缩**      | brotli + flate2       | 协议解压需求，cc-switch Cargo.toml 已声明                     |
| **Rust 加密**      | md-5 crate            | WBI 签名 MD5 计算                                             |
| **数据持久化**     | tauri-plugin-store    | 轻量 KV 存储（Cookie/配置），cc-switch 已集成                 |
| **系统托盘**       | tauri tray-icon       | 内置支持，cc-switch tray.rs 可直接参考                        |

### 为什么选 React 而非 Vue？

| 对比维度           | React 18                                      | Vue 3         |
| ------------------ | --------------------------------------------- | ------------- |
| cc-switch 参考价值 | ★★★★★ **完全匹配**                            | ★★ 需自行转换 |
| UI 组件库生态      | ★★★★★ shadcn/ui (cc-switch验证)               | ★★★ Naive UI  |
| 状态管理           | ★★★★ Zustand (cc-switch验证) + TanStack Query | ★★★★ Pinia    |

**关键决策理由：**

1. **cc-switch 是 React + Tauri 2 的完整参考**：从 `tray.rs` 到 hooks，从 `Cargo.toml` 到 `tauri.conf.json`，全部可直接借鉴
2. **shadcn/ui 比 Naive UI 更适合桌面应用**：组件可复制进项目完全控制样式
3. **TanStack Query 天然适合 IPC 异步调用**：`useQuery` 封装 `invoke()` 自动处理 loading/error/cache
4. **BLSPAM（Vue 3）的 API 逻辑层可独立参考**：`src/utils/bili/index.ts` 是纯 TypeScript，框架无关

---

## 二、项目结构设计

> 说明：本节反映**当前代码实际结构**。组件按类型分组（`danmaku/`、`ui/`、`layout/`），未按领域拆分。

```
bilidanmu/
├── package.json                        # 前端依赖 & scripts
├── package-lock.json
├── vite.config.ts                      # Vite 7 构建配置
├── tsconfig.json
├── components.json                     # shadcn/ui 配置
├── tailwind.config.ts
├── postcss.config.js
├── .gitignore
│
├── src/                                # ═══ 前端 (React 18 + TypeScript) ═══
│   ├── main.tsx                        # React 入口
│   ├── App.tsx                         # 根组件（路由 + 布局 + 启动恢复）
│   ├── index.css                       # 全局样式 + TailwindCSS
│   ├── icon.ico                        # 应用图标
│   │
│   ├── components/                     # 组件（按类型分组）
│   │   ├── ui/                         # 通用 UI 组件
│   │   │   ├── PageTabs.tsx            # Radix Tabs 页面导航
│   │   │   ├── ProxiedImage.tsx        # <img> 代理包装（自动代理 B 站 CDN）
│   │   │   └── InlineMessage.tsx       # 统一内联消息组件（error/success/info/warning，2秒自动消失）
│   │   │
│   │   ├── layout/                     # 布局组件
│   │   │   ├── AppLayout.tsx           # 主布局（侧边栏 + 内容区）
│   │   │   ├── AppSidebar.tsx          # 侧边栏导航（64px 图标式 + 版本号）
│   │   │   └── TitleBar.tsx            # 自定义窗口标题栏（拖拽 + 最小化/最大化/关闭）
│   │   │
│   │   └── danmaku/                    # 弹幕相关组件
│   │       ├── DanmakuMessageItem.tsx  # 单条弹幕渲染（普通/礼物/进场/大表情）
│   │       ├── SuperChatCard.tsx       # SC 醒目留言卡片（真实颜色 + 背景图）
│   │       ├── InlineEmotText.tsx      # inline 表情混排（正则替换 + img 渲染）
│   │       ├── EmoticonPickerPanel.tsx # 表情选择器面板（包切换 + 网格 + 可用性）
│   │       ├── AutoSendPanel.tsx       # 自动发送面板（文字/表情/收藏夹/点赞四 Tab）
│   │       ├── LikeButton.tsx          # 长按点赞按钮
│   │       ├── BottomActivityBar.tsx   # 底部活动信息栏
│   │       ├── SubtitleOverlay.tsx     # 半透明字幕叠加层（渐入/渐出）
│   │       ├── AccountSwitcher.tsx     # 弹幕窗口内账号切换
│   │       └── MedalBadge.tsx          # 粉丝勋章组件
│   │
│   ├── pages/                          # 页面
│   │   ├── RoomPage.tsx                # 子页面一：直播间管理
│   │   ├── AccountPage.tsx             # 子页面二：账号管理
│   │   ├── AIPage.tsx                  # 子页面三：AI 代理配置
│   │   ├── SettingsPage.tsx            # 子页面四：设置
│   │   ├── DanmakuPage.tsx             # 发送弹幕页面（独立全屏布局）
│   │   └── AiAssistantPage.tsx         # AI 助手页面（独立窗口）
│   │
│   ├── hooks/                          # React Hooks
│   │   ├── useDanmaku.ts              # 弹幕发送逻辑
│   │   ├── useDanmakuStream.ts        # WebSocket 弹幕流监听
│   │   ├── useAutoSend.ts             # 自动发送生命周期（start/stop/事件/卸载条件停止）
│   │   ├── useAutoLike.ts             # 自动点赞生命周期
│   │   ├── useTauriEvent.ts           # Tauri 事件监听通用 Hook
│   │   ├── useProxyImage.ts           # 图片代理 Hook（LRU 缓存 + 竞态取消）
│   │   ├── useAudioPlayer.ts          # mpegts.js 音频播放器 Hook（播放/停止/音量/重连）
│   │   ├── useSttTranscript.ts        # STT 转录延迟缓冲 + 按需 RAF 循环
│   │   ├── useDividerDrag.ts          # 可拖动分割栏 Hook（pointer events + localStorage 持久化）
│   │   ├── useWindowPersistence.ts    # 窗口尺寸持久化 Hook + loadWindowSize
│   │   └── useTheme.ts                # 主题切换（light/dark/system）
│   │
│   ├── stores/                         # Zustand 状态管理
│   │   ├── auth-store.ts               # 认证状态
│   │   ├── room-store.ts               # 直播间状态
│   │   ├── danmaku-store.ts            # 弹幕数据
│   │   ├── ai-store.ts                 # AI 总结缓存
│   │   └── settings-store.ts           # 应用设置
│   │
│   ├── lib/                            # 工具 & 封装
│   │   ├── tauri.ts                    # Tauri invoke 类型安全封装（8 命名空间）
│   │   ├── utils.ts                    # 通用工具（cn 等）
│   │   ├── constants.ts                # 常量（APP_NAME, getAppVersion()）
│   │   └── query-client.ts             # TanStack Query 客户端实例
│   │
│   └── types/                          # TypeScript 类型定义
│       ├── bilibili.ts                  # B站 API 类型 + makePkgKey 工具函数
│       └── danmaku.ts                  # 弹幕类型
│
├── src-tauri/                          # ═══ 后端 (Rust) ═══
│   ├── Cargo.toml                      #
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/
│   │
│   └── src/
│       ├── lib.rs                      # Tauri 入口 + AppState 定义
│       ├── main.rs                     # 主入口
│       ├── db.rs                       # SQLite 数据库初始化
│       ├── tray.rs                     # 系统托盘
│       │
│       ├── commands/                   # Tauri IPC 命令（43 个已注册）
│       │   ├── mod.rs                  # 模块导出 + build_api_client()
│       │   ├── auth.rs                 # 认证命令（6 个）
│       │   ├── room.rs                 # 直播间命令（10 个，含 open_danmaku_window/get_rooms_live_status）
│       │   ├── danmaku.rs              # 弹幕发送命令（4 个）
│       │   ├── websocket.rs            # WebSocket 控制命令（2 个）
│       │   ├── ai.rs                   # AI 模型命令（7 个，含 update/delete）
│       │   ├── settings.rs             # 设置命令（3 个，含 is_stt_available）
│       │   ├── proxy.rs                # 图片代理命令（1 个，SSRF 白名单 + 5MB 限制）
│       │   ├── selections.rs           # Selections 键值持久化命令（2 个，批量事务）
│       │   └── stt.rs                   # STT 命令（6 个：start/stop/switchModel/getModelDir/listModels/openModelDir）
│       │
│       ├── bili/                       # B站协议实现
│       │   ├── mod.rs
│       │   ├── api.rs                  # BiliApiClient（reqwest + WBI 签名）
│       │   ├── credential.rs           # 凭证管理（Cookie 解析 + SESSDATA 编码）
│       │   ├── wbi.rs                  # WBI 签名（MIXIN_KEY_ENC_TAB + MD5 + 12h 缓存）
│       │   ├── buvid.rs                # buvid3/4 生成（随机 hex + 时间戳）
│       │   ├── protocol.rs             # 二进制协议（16B 头 + Brotli/zlib 解压 + 消息解析）
│       │   └── ws_client.rs            # WebSocket 客户端（认证/心跳/退避重连）
│       │
│       ├── models/                     # 数据模型
│       │   ├── mod.rs
│       │   ├── account.rs              # Credential, LoginStatus, AccountInfo
│       │   ├── room.rs                 # Room, RoomInfo, SearchRoomResult, EmoticonPackage
│       │   ├── message.rs              # DanmakuEvent（#[serde(rename="type")]）
│       │   ├── response.rs             # BiliResponse
│       │   ├── settings.rs             # Settings
│       │   ├── ai.rs                   # AIModel, AIModelInput, TestResult
│       │   └── stream.rs               # StreamInfo, UrlInfo（v2 API 响应）
│       │
│       ├── stt/                         # STT 语音识别模块
│       │   ├── mod.rs                   # SttManager 生命周期（Notify 取消机制）
│       │   ├── pipeline.rs              # FLV 解封装 → AAC 解码（symphonia 0.6）→ 重采样 → sherpa-onnx 识别
│       │   └── flv_demux.rs             # FLV AAC 帧提取 + ADTS 封装
│       │
│       ├── proxy/                       # 代理模块
│       │   └── stream_proxy.rs          # hyper 1.x 本地 HTTP 代理（OnceCell 懒加载，STT tee）
│       │
│       ├── credential_store.rs         # Cookie 持久化（tauri-plugin-store）
│       ├── room_store.rs               # 房间持久化（SQLite）
│       ├── settings_store.rs           # 设置持久化（tauri-plugin-store）
│       ├── ai_store.rs                 # AI 模型持久化（SQLite）
│       ├── emoticon_store.rs           # 表情包持久化（SQLite）
│       └── selections_store.rs         # 通用键值持久化（SQLite，批量事务）
│
└── scripts/                           # 预留，当前仓库尚未创建 build 脚本
    └── build.ps1
```

> **运行时开关**：STT 和 AI 功能始终编译进二进制，用户可在设置中按需开启/关闭。`is_stt_available()` 和 `is_ai_available()` 始终返回 `true`。

---

## 三、架构分层

```
┌──────────────────────────────────────────────────────────────┐
│                  React 18 + shadcn/ui 前端                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │RoomPage  │  │AcctPage  │  │ AIPage   │  │DnmkuPage │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       └──────────────┼──────────────┼──────────────┘         │
│                 React Hooks + Zustand Stores                 │
│       └──────────────┼──────────────┘         │              │
│               Tauri IPC (invoke / listen)                    │
├──────────────────────────────────────────────────────────────┤
│                    Rust 后端 (Tauri)                          │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  commands/  ← IPC 命令处理层                           │   │
│  └───────────────────────┬───────────────────────────────┘   │
│  ┌───────────────────────┴───────────────────────────────┐   │
│  │  bili/  ← B站协议实现层                               │   │
│  │  api.rs · ws_client · credential · wbi               │   │
│  └───────────────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  STT Pipeline（语音识别流水线）                       │   │
│  │  proxy tee → FLV 解封装 → AAC 解码 → 重采样          │   │
│  │  → sherpa-onnx 识别 → emit 转录事件                  │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## 四、数据流

```
用户操作 → React 组件 → Zustand action / Hook
                         ↓
                    invoke('command_name', args)  ← Tauri IPC
                         ↓
                    Rust commands/  →  bili/ (协议实现)
                         ↓                    ↓
                    Rust 返回值          HTTP API / WebSocket
                         ↓                    ↓
                    invoke 返回结果     Tauri event emit
                         ↓                    ↓
                    Zustand store ←  listen('event-name')
                         ↓
                    React 重渲染
```

---

## 五、窗口管理

所有窗口均使用 `decorations: false` 隐藏原生标题栏，由自定义 `TitleBar` 组件提供拖拽、最小化、最大化、关闭功能。

### 弹幕窗口

- **透明背景**：`transparent: true`，配合 CSS `[data-transparent]` 属性使 html/body 背景透明，支持弹幕窗口背景不透明度调节
- **关闭行为**：关闭弹幕窗口只是隐藏到托盘（不断开 WS/音频连接），需要断开连接时使用窗口内的退出按钮
- **穿透支持**：弹幕区域和礼物区域支持点击穿透，不干扰底层窗口操作

### 系统托盘交互

- **单击**：切换弹幕窗口显示/隐藏（250ms 延迟区分单击/双击）
- **双击**：显示主窗口
- 托盘菜单显示当前已登录账号列表（通过 `AccountMeta` 维护）

---

## 六、CSS 架构

弹幕窗口使用专用 CSS 类实现透明背景和主题适配：

| 类名 | 用途 |
|---|---|
| `[data-transparent]` | 属性选择器，使 html/body 背景完全透明（弹幕窗口专用） |
| `.danmaku-bg-main` | 弹幕主区域背景，使用 `var(--bg-a)` alpha 变量控制不透明度 |
| `.danmaku-bg-bar` | 弹幕工具栏背景，半透明效果 |
| `.danmaku-bg-panel` | 弹幕面板（表情选择器、设置等）背景 |
| `.danmaku-btn-active` | 激活状态按钮样式（emerald 背景色） |

---

## 七、全局状态设计

### Zustand Stores

```typescript
// auth-store.ts
interface AuthState {
  accounts: Credential[];
  activeAccountId: string | null;
  setAccounts: (accounts: Credential[]) => void;
  addAccount: (account: Credential) => void;
  removeAccount: (accountId: string, newActiveAccountId?: string | null) => void;
  setActiveAccount: (accountId: string | null, account?: Credential) => void;
}

// room-store.ts
interface RoomState {
  rooms: Room[];
  currentRoomId: string | null;
  searchResults: SearchRoomResult[];
  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room | RoomInfo) => void;
  removeRoom: (roomId: number) => void;
  setCurrentRoomId: (id: string | null) => void;
}

// danmaku-store.ts
interface DanmakuState {
  messages: DanmakuMessage[];
  wsConnected: boolean;
  sentCount: number;
  onlineCount: number;
  totalLikeCount: number;
  latestLike: LikeMessage | null;
  latestEntry: EntryMessage | null;
}
```

### AppState（Rust 后端）

```
AppState (`src-tauri/src/lib.rs`):
  credential:              TokioMutex<Option<BiliCredential>>     — 主凭证（WS/音频播放）
  sending_credential:      TokioMutex<Option<BiliCredential>>     — 发送凭证（弹幕/表情发送，不干扰 WS）
  credentials:             StdMutex<HashMap<String, BiliCredential>> — 多账号凭证映射
  active_account_id:       StdMutex<Option<String>>
  account_metas:           StdMutex<HashMap<String, AccountMeta>>   — 托盘显示用账号元数据
  wbi_cache:               Arc<TokioMutex<WbiKeyCache>>
  ws_client:               TokioMutex<Option<DanmakuWsClient>>
  auto_sender:             TokioMutex<AutoSenderState>
  db:                      Arc<StdMutex<Option<rusqlite::Connection>>>
  http_client:             reqwest::Client（共享，带代理）
  astrbot_client:          reqwest::Client（无代理）
  stream_proxy:            Arc<StreamProxyServer>
  astrbot_config:          TokioMutex<Option<AstrbotConfig>>
  astrbot_callback_port:   Arc<TokioMutex<u16>>
  ai_suggestions:          Arc<StdMutex<Vec<AiSuggestion>>>
  stt_manager:             Arc<TokioMutex<Option<SttManager>>>
```

**双凭证架构**：`credential` 用于 WS 连接和音频播放（切换账号会断开 WS），`sending_credential` 用于发送弹幕和表情（可在不中断 WS 的情况下切换发送身份）。`get_sending_credential()` 辅助函数在 `sending_credential` 为空时回退到主 `credential`。

---

## 八、依赖清单

### 前端 (package.json)

```json
{
  "dependencies": {
    "react": "^18.2",
    "react-dom": "^18.2",
    "react-router-dom": "^7.9",
    "@tauri-apps/api": "^2.8",
    "@tauri-apps/plugin-store": "^2.0",
    "zustand": "^5.0",
    "@tanstack/react-query": "^5.90",
    "clsx": "^2.1",
    "tailwind-merge": "^3.3",
    "class-variance-authority": "^0.7",
    "qrcode": "^1.5",
    "lucide-react": "^0.542",
    "sonner": "^2.0",
    "@radix-ui/react-dialog": "^1.1",
    "@radix-ui/react-label": "^2.1",
    "@radix-ui/react-select": "^2.2",
    "@radix-ui/react-slot": "^1.2",
    "@radix-ui/react-tabs": "^1.1",
    "mpegts.js": "^1.7"
  },
  "devDependencies": {
    "typescript": "^5.8",
    "vite": "^7.1",
    "@vitejs/plugin-react": "^4.7",
    "tailwindcss": "^3.4",
    "autoprefixer": "^10.4",
    "postcss": "^8.5",
    "@tauri-apps/cli": "^2.8",
    "@types/qrcode": "^1.5",
    "@types/react": "^18.2",
    "@types/react-dom": "^18.2",
    "@types/node": "^20.17"
  }
}
```

### 后端 (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2.8", features = ["tray-icon", "image-png", "devtools"] }
tauri-plugin-store = "2"
tauri-plugin-shell = "2"
tauri-plugin-opener = "2"
tauri-plugin-log = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "time", "sync"] }
reqwest = { version = "0.12", features = ["rustls-tls", "json", "stream"] }
tokio-tungstenite = { version = "0.24", features = ["rustls-tls-webpki-roots"] }
futures-util = "0.3"
brotli = "7"
flate2 = "1"
md-5 = "0.10"
rand = "0.8"
url = "2.5"
log = "0.4"
thiserror = "2"
regex = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
base64 = "0.22"
hyper = { version = "1", features = ["http1", "server"] }
hyper-util = { version = "0.1", features = ["tokio", "http1", "server-auto"] }
http-body-util = "0.1"
bytes = "1"
sherpa-onnx = { version = "1.13", optional = true }
symphonia = { version = "0.6", default-features = false, features = ["aac"], optional = true }

[features]
default = ["stt"]
stt = ["dep:sherpa-onnx", "dep:symphonia"]

[profile.release]
codegen-units = 1
lto = "thin"
opt-level = "s"
strip = "symbols"
```

---

## 九、关键模式

- **类型映射**：前端类型（`src/types/danmaku.ts`、`src/types/bilibili.ts`）必须与 Rust 模型（`src-tauri/src/models/`）保持一致。字段名使用 camelCase（serde rename）。
- **新增 IPC 命令**：在 `commands/*.rs` 添加 Rust `#[tauri::command]`，在 `lib.rs` 的 `.invoke_handler()` 注册，在 `src/lib/tauri.ts` 添加 TS 封装。若使用窗口 API，还需在 `capabilities/default.json` 添加权限声明。
- **新增事件类型**：Rust 端通过 `app.emit("event-name", payload)` 发送，前端通过 `useTauriEvent<T>("event-name", callback)` 监听。
- **Vite 配置**：根目录 `src/`，输出 `dist/`，开发服务器固定 `http://localhost:3000`（`strictPort: true`）。`tauri.conf.json` 使用 `beforeDevCommand: npm run dev:renderer` 和 `beforeBuildCommand: npm run build:renderer`。
- **窗口关闭行为**：主窗口关闭隐藏到托盘（不退出）。弹幕窗口关闭也隐藏到托盘（不断开 WS/音频），需手动点击退出按钮断开连接。
- **双凭证架构**：`state.credential`（主凭证）用于 WS 连接和音频播放；`state.sending_credential`（发送凭证）用于发送弹幕/表情。`get_sending_credential()` 辅助函数在发送凭证为空时回退到主凭证，避免切换发送身份时中断 WS 连接和音频播放。
- **设置深合并**：`setSettings` 将加载的持久化设置与 `defaultSettings` 进行深合并，确保持久化数据中缺少的新字段使用默认值填充。
- **STT 流水线**：运行在 `spawn_blocking` 中避免阻塞 tokio 运行时。取消机制：`bytes_tx = None` 关闭通道（解除 `blocking_recv` 阻塞）+ `cancel` AtomicBool + `Notify` 即时取消转录循环。
- **模型 ID**：`model_id` 是枚举式字符串（如 `"large"`、`"xlarge"`），不允许绝对路径。`get_model_dir()` 校验路径穿越（`..`/`/`\`）并基于 `app_data_dir/models/stt/{model_id}` 解析。
- **sherpa-onnx**：`sherpa-onnx = "1.13"` 提供 `OnlineRecognizer`、`OnlineStream`、`LinearResampler`，全部静态链接，无 LLVM 依赖。
- **symphonia 0.6**：AAC 解码使用 ADTS reader，API 与 0.5 差异显著。
- **音频采样归一化**：无符号类型（U8/U16/U24/U32）居中到 [-1, 1] 避免直流偏置；声道数取自解码器输出（非 FLV 头）。
- **FLV 安全限制**：`data_size` 上限 `MAX_TAG_DATA_SIZE=65536` 防止内存耗尽。

---

## 十、参考项目

`reference/` 目录包含本项目参考的上游项目：`cc-switch`（Tauri 2 + React 架构）、`BLSPAM`（B站 API + 发送逻辑）、`PiliPlus`（协议 + SC 渲染）、`bilibili-API-collect`（API 文档）。
