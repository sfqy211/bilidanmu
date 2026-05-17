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
├── package.json                        # 前端依赖 & scripts (v0.2.0)
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
│   │
│   ├── components/                     # 组件（按类型分组）
│   │   ├── ui/                         # 通用 UI 组件
│   │   │   ├── PageTabs.tsx            # Radix Tabs 页面导航
│   │   │   └── ProxiedImage.tsx        # <img> 代理包装（自动代理 B 站 CDN）
│   │   │
│   │   ├── layout/                     # 布局组件
│   │   │   ├── AppLayout.tsx           # 主布局（侧边栏 + 内容区）
│   │   │   └── AppSidebar.tsx          # 侧边栏导航（64px 图标式 + 版本号）
│   │   │
│   │   └── danmaku/                    # 弹幕相关组件
│   │       ├── DanmakuMessageItem.tsx  # 单条弹幕渲染（普通/礼物/进场/大表情）
│   │       ├── SuperChatCard.tsx       # SC 醒目留言卡片（真实颜色 + 背景图）
│   │       ├── InlineEmotText.tsx      # inline 表情混排（正则替换 + img 渲染）
│   │       ├── EmoticonPickerPanel.tsx # 表情选择器面板（包切换 + 网格 + 可用性）
│   │       ├── LoopSenderPanel.tsx     # 自动发送面板（多行输入 + 间隔 + 启停）
│   │       └── SubtitleOverlay.tsx     # 半透明字幕叠加层（渐入/渐出）
│   │
│   ├── pages/                          # 页面
│   │   ├── RoomPage.tsx                # 子页面一：直播间管理
│   │   ├── AccountPage.tsx             # 子页面二：账号管理
│   │   ├── AIPage.tsx                  # 子页面三：AI 接入
│   │   ├── SettingsPage.tsx            # 子页面四：设置
│   │   └── DanmakuPage.tsx             # 发送弹幕页面（独立全屏布局）
│   │
│   ├── hooks/                          # React Hooks
│   │   ├── useAuth.ts                  # 认证状态（re-export auth-store）
│   │   ├── useRoom.ts                  # 直播间状态（re-export room-store）
│   │   ├── useDanmaku.ts              # 弹幕发送逻辑
│   │   ├── useDanmakuStream.ts        # WebSocket 弹幕流监听
│   │   ├── useScheduler.ts            # 发送调度（自动发送）
│   │   ├── useTauriEvent.ts           # Tauri 事件监听通用 Hook
│   │   ├── useProxyImage.ts           # 图片代理 Hook（LRU 缓存 + 竞态取消）
│   │   ├── useAudioPlayer.ts          # mpegts.js 音频播放器 Hook（播放/停止/音量/重连）
│   │   ├── useSttTranscript.ts        # STT 转录延迟缓冲 + 按需 RAF 循环
│   │   └── useTheme.ts                # 主题切换（light/dark/system）
│   │
│   ├── stores/                         # Zustand 状态管理
│   │   ├── auth-store.ts               # 认证状态
│   │   ├── room-store.ts               # 直播间状态
│   │   ├── danmaku-store.ts            # 弹幕数据
│   │   ├── ai-store.ts                 # AI 模型状态
│   │   └── settings-store.ts           # 应用设置
│   │
│   ├── lib/                            # 工具 & 封装
│   │   ├── tauri.ts                    # Tauri invoke 类型安全封装（8 命名空间）
│   │   ├── utils.ts                    # 通用工具（cn 等）
│   │   ├── constants.ts                # 常量（APP_NAME, APP_VERSION）
│   │   └── query-client.ts             # TanStack Query 客户端实例
│   │
│   └── types/                          # TypeScript 类型定义
│       ├── bilibili.ts                  # B站 API 类型 + makePkgKey 工具函数
│       ├── danmaku.ts                  # 弹幕类型
│       └── config.ts                   # 配置类型
│
├── src-tauri/                          # ═══ 后端 (Rust) ═══
│   ├── Cargo.toml                      # v0.2.0
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
│       ├── commands/                   # Tauri IPC 命令（39 个已注册）
│       │   ├── mod.rs                  # 模块导出 + build_api_client()
│       │   ├── auth.rs                 # 认证命令（6 个）
│       │   ├── room.rs                 # 直播间命令（10 个，含 open_danmaku_window/get_rooms_live_status）
│       │   ├── danmaku.rs              # 弹幕发送命令（4 个）
│       │   ├── websocket.rs            # WebSocket 控制命令（2 个）
│       │   ├── ai.rs                   # AI 模型命令（7 个，含 update/delete）
│       │   ├── settings.rs             # 设置命令（2 个）
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

## 五、全局状态设计

### Zustand Stores

```typescript
// auth-store.ts
interface AuthState {
  accounts: Account[];
  sendAccountId: string | null; // 当前发送账号
  recvAccountId: string | null; // 当前接收账号
  stealthMode: boolean; // 隐身模式
}

// room-store.ts
interface RoomState {
  rooms: Room[];
  currentRoomId: string | null;
  roomStatus: Record<
    string,
    { isLive: boolean; online: number; title: string }
  >;
}

// danmaku-store.ts
interface DanmakuState {
  messages: DanmakuMessage[];
  wsConnected: boolean;
  sentCount: number;
  isMuted: boolean;
  muteRemainSec: number;
  autoSpamRunning: boolean;
}

// ai-store.ts
interface AIState {
  models: AIModel[];
  currentModelId: string | null;
}

// settings-store.ts
interface SettingsState {
  sendInterval: { min: number; max: number };
  rateLimit: { maxPerWindow: number; windowSec: number };
  riskControl: {
    randomInterval: boolean;
    jitter: boolean;
    autoPauseOnMute: boolean;
    appendRandomSuffix: boolean;
  };
  receive: {
    autoConnect: boolean;
    autoReconnect: boolean;
    reconnectInterval: number;
    maxReconnectInterval: number;
  };
  appearance: {
    theme: "light" | "dark" | "system";
    fontSize: number;
    showMedal: boolean;
    showLevel: boolean;
  };
  notification: {
    muteAlert: boolean;
    cookieExpiry: boolean;
    sendSuccess: boolean;
    scAlert: boolean;
  };
  stt: {
    enabled: boolean;
    modelId: string; // "large" | "xlarge"
    syncDelayMs: number; // -2000 ~ +2000
  };
}
```

---

## 六、依赖清单

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
tauri = { version = "2.8", features = ["tray-icon", "image-png"] }
tauri-plugin-store = "2"
tauri-plugin-shell = "2"
tauri-plugin-opener = "2"
tauri-plugin-log = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "time", "sync"] }
reqwest = { version = "0.12", features = ["rustls-tls", "json"] }
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
hyper = "1"
hyper-util = "0.1"
http-body-util = "0.1"
symphonia = { version = "0.6", features = ["aac"] }
sherpa-onnx = "1.13"

[profile.release]
codegen-units = 1
lto = "thin"
opt-level = "s"
strip = "symbols"
```
