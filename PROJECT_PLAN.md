# BiliDanmu - B站直播间弹幕发送客户端 项目规划

> 基于 7 个参考项目的深度分析，规划一个 Windows 桌面端 B站直播间弹幕发送客户端。

---

## 当前进度

| 阶段                           | 状态        | 说明                                                                                                                                 |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 1：项目骨架 & Tauri 环境 | ✅ 已完成   | 前后端骨架搭建完成，路由 / layout / Zustand stores / Tauri 命令注册已齐全，`npm run typecheck` 与 `cargo check` 已通过             |
| Phase 2：认证 & WBI 签名       | ✅ 已完成   | `credential.rs` / `wbi.rs` / `buvid.rs` / `credential_store.rs` 已接通；Cookie 登录、启动恢复登录、WBI 缓存、buvid 生成均已实现    |
| Phase 3：弹幕发送 & API        | ✅ 已完成   | 文字/表情弹幕发送、表情列表获取、房间搜索、房间信息、弹幕服务器信息、循环发送后端均为真实调用                                      |
| Phase 4：WebSocket 弹幕接收    | ✅ 已完成   | `protocol.rs` 协议解析、`ws_client.rs` 连接/认证/心跳/重连、前端事件监听和 DanmakuPage 基础展示均已接通                            |
| Phase 5：前端页面开发          | ✅ 已完成   | `RoomPage`、`DanmakuPage`（组件化拆分 + 独轮车+礼物/进场/SC+表情）、`AccountPage`、`SettingsPage`、`AIPage` 全部进入可用态 |
| Phase 6：完善 & 打包           | 🔧 进行中   | 系统托盘、图片代理、SQLite 迁移、GitHub Actions CI/CD 已完成；配置导入导出、账号移除命令尚未实现 |

### 当前已实现情况（按代码现状）

**已完成 / 可用：**

- Tauri 2 + React 18 + TypeScript 项目骨架（v0.1.2）
- 主布局、侧边栏导航、基础路由
- Cookie 登录、二维码登录、启动恢复登录、登出
- WBI 签名与缓存
- 房间搜索（名称 / 房间号 / 链接 / UID）
- 房间添加、移除、本地持久化（SQLite）
- 文字弹幕发送、表情弹幕发送命令
- 表情列表获取（get_emoticons API + 前端表情选择器）
- 循环发送后端（start_loop_send / stop_loop_send，oneshot 控制 + 事件通知）
- buvid3/4 真实生成（随机 hex + 时间戳，自动补充到 Cookie 缺失字段）
- WebSocket 弹幕接收、心跳、断线重连
- DanmakuPage 实时弹幕流、时间戳、人气值、自动滚动、回到底部、Enter 发送、表情选择器
- 接收增强：礼物消息（SEND_GIFT）、进场消息（INTERACT_WORD 新旧结构兼容）、SC 消息（SUPER_CHAT_MESSAGE + 真实颜色两段式卡片）、inline 表情渲染（emots 解析 + 正则替换 + img 渲染）、大表情渲染（dmType=1 + info[0][13] 解析 + PiliPlus 尺寸策略）
- 独轮车完整版（useScheduler + 循环发送面板：切房/卸载自动停、发送计数、条目索引、停止原因、前后端 0.3s 下限一致）
- AccountPage 真实 UI（扫码登录 + Cookie 登录、本地 QR 生成、过期自动刷新、账号展示、发送/接收标记、退出登录、隐身模式开关）
- SettingsPage 真实读写（settings_store.rs 持久化 + IPC 命令 + 前端表单：发送间隔/接收/外观/通知核心子集）
- AIPage 最小真实版（ai_store.rs 持久化 + IPC 命令：保存/加载/测试连接/获取模型列表/切换当前/编辑/删除，ID 改用时间戳+随机 hex 防冲突）
- 系统托盘动态菜单（账号/房间/AI 状态实时展示，状态变化自动刷新）
- DanmakuPage 组件化拆分：SuperChatCard（SC 卡片）、DanmakuMessageItem（普通/礼物/进场/大表情渲染）、InlineEmotText（inline 表情混排）、EmoticonPickerPanel（表情选择器）、LoopSenderPanel（独轮车面板）
- 图片代理系统：`proxy_image` 命令（Rust 端带 Referer 的服务端代理 + SSRF 白名单 + 5MB 大小限制 + 共享 reqwest::Client）、`useProxyImage` hook（LRU 200 条缓存 + 竞态取消 + 仅代理 hdslb.com）、`ProxiedImage` 组件（透明替换 `<img>`）
- SQLite 持久化迁移：`db.rs` 初始化 + `room_store.rs` / `ai_store.rs` / `emoticon_store.rs` / `selections_store.rs` 均使用 SQLite
- Selections 恢复机制：批量读写 `load_selections` / `save_selections`（事务写入），前端启动时恢复并校验账号/房间选择项有效性
- 表情包 key 修复：`makePkgKey(pkgId-pkgType)` 复合 key 解决不同 pkgType 同 pkgId 冲突，提取至 `bilibili.ts` 共享
- 主题切换（useTheme hook + dark class toggle）

**未完成 / 占位：**

- （无功能性占位；详见下方「未完成项」）

---

## 一、核心需求分析

从参考项目中提炼出的核心功能矩阵：

| 功能                        | 来源参考                          | 优先级 |
| --------------------------- | --------------------------------- | ------ |
| 直播间文字弹幕发送          | BLSPAM, PiliPlus, bilibili-api    | P0     |
| 直播间表情弹幕发送          | BLSPAM, PiliPlus, simple_live_app | P0     |
| Cookie 认证                 | 全部项目                          | P0     |
| WBI 签名                    | bilibili-api, PiliPlus, astrbot   | P0     |
| 二维码登录                  | bilibili-api, PiliPlus            | P1     |
| 直播间弹幕接收（WebSocket） | astrbot, bilibili-api, PiliPlus   | P1     |
| 弹幕发送间隔/队列控制       | BLSPAM                            | P2     |
| 消息模板/收藏夹循环发送     | BLSPAM                            | P2     |
| 多直播间支持                | -                                 | P2     |
| 速率限制/风控规避           | bilibili-api（反爬策略）          | P3     |
| 系统托盘                    | cc-switch                         | P2     |

### 关键 API（从参考项目中提取）

**发送弹幕（核心）：**

```
POST https://api.live.bilibili.com/msg/send
Content-Type: application/x-www-form-urlencoded

参数: msg, roomid, color(16777215=白色), mode(1=滚动), fontsize(25),
      rnd(当前时间戳), csrf(bili_jct), csrf_token(bili_jct),
      dm_type(0=文字, 1=表情), emoticonOptions(JSON, 表情时需要),
      bubble(0), reply_mid(0), reply_type(0)
```

**获取弹幕服务器信息（接收用）：**

```
GET https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?id={room_id}
需要 WBI 签名
```

**获取直播间信息：**

```
GET https://api.live.bilibili.com/room/v1/Room/get_info?room_id={room_id}
```

**WebSocket 弹幕流协议（接收用）：**

```
连接: wss://{host}:{wss_port}/sub
认证包(op=7): {uid, roomid, protover:3, platform:"web", type:2, key}
心跳包(op=2): 每30秒发送空body
数据格式: 16字节头 + 压缩body (protover 3=Brotli, 2=zlib, 0=原始JSON)
```

---

## 二、技术栈选型

### 推荐方案：Tauri 2 + React 18 + TypeScript

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

| 对比维度           |                   React 18                    |     Vue 3     |
| ------------------ | :-------------------------------------------: | :-----------: |
| cc-switch 参考价值 |              ★★★★★ **完全匹配**               | ★★ 需自行转换 |
| UI 组件库生态      |        ★★★★★ shadcn/ui (cc-switch验证)        | ★★★ Naive UI  |
| 状态管理           | ★★★★ Zustand (cc-switch验证) + TanStack Query |  ★★★★ Pinia   |

**关键决策理由：**

1. **cc-switch 是 React + Tauri 2 的完整参考**：从 `tray.rs` 到 hooks，从 `Cargo.toml` 到 `tauri.conf.json`，全部可直接借鉴
2. **shadcn/ui 比 Naive UI 更适合桌面应用**：组件可复制进项目完全控制样式
3. **TanStack Query 天然适合 IPC 异步调用**：`useQuery` 封装 `invoke()` 自动处理 loading/error/cache
4. **BLSPAM（Vue 3）的 API 逻辑层可独立参考**：`src/utils/bili/index.ts` 是纯 TypeScript，框架无关

---

## 三、项目结构设计

> 说明：本节反映**当前代码实际结构**。组件按类型分组（`danmaku/`、`ui/`、`layout/`），未按领域拆分（`auth/`、`room/`、`sender/`、`ai/`、`settings/`），业务 UI 目前主要写在页面内。

```
bilidanmu/
├── package.json                        # 前端依赖 & scripts (v0.1.2)
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
│   │       └── LoopSenderPanel.tsx     # 独轮车面板（多行输入 + 间隔 + 启停）
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
│   │   ├── useScheduler.ts            # 发送调度（独轮车）
│   │   ├── useTauriEvent.ts           # Tauri 事件监听通用 Hook
│   │   ├── useProxyImage.ts           # 图片代理 Hook（LRU 缓存 + 竞态取消）
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
│   ├── Cargo.toml                      # v0.1.2
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
│       ├── commands/                   # Tauri IPC 命令（32 个已注册）
│       │   ├── mod.rs                  # 模块导出 + build_api_client()
│       │   ├── auth.rs                 # 认证命令（6 个）
│       │   ├── room.rs                 # 直播间命令（8 个，含 open_danmaku_window）
│       │   ├── danmaku.rs              # 弹幕发送命令（4 个）
│       │   ├── websocket.rs            # WebSocket 控制命令（2 个）
│       │   ├── ai.rs                   # AI 模型命令（7 个，含 update/delete）
│       │   ├── settings.rs             # 设置命令（2 个）
│       │   ├── proxy.rs                # 图片代理命令（1 个，SSRF 白名单 + 5MB 限制）
│       │   └── selections.rs           # Selections 键值持久化命令（2 个，批量事务）
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
│       │   └── ai.rs                   # AIModel, AIModelInput, TestResult
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

### 架构分层

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
└──────────────────────────────────────────────────────────────┘
```

### 数据流

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

## 四、页面设计

### 页面总览

两类页面：**管理面板**（侧边栏 + Tab 内容区）、**弹幕页面**（独立全屏）。

```
┌─────────────────────────────────────────────────────────────────┐
│                         BiliDanmu                               │
├─────────────┬───────────────────────────────────────────────────┤
│             │                                                   │
│  管理面板    │  弹幕页面（独立全屏布局）                           │
│  (4 个子页面│  (从管理面板子页面一「打开弹幕」进入)                │
│   通过 Tab  │                                                   │
│   切换)     │  ┌─────────────────────────────────────────────┐ │
│             │  │          实时弹幕流 + 发送栏                  │ │
│  ┌──┐       │  │  弹幕列表 + 表情选择器 + 独轮车面板           │ │
│  │BD│       │  └─────────────────────────────────────────────┘ │
│  ├──┤       │                                                   │
│  │📺│       │                                                   │
│  │👤│       │                                                   │
│  │🤖│       │                                                   │
│  │⚙│       │                                                   │
│  ├──┤       │                                                   │
│  │v0│       │                                                   │
│  └──┘       │                                                   │
├─────────────┴───────────────────────────────────────────────────┤
│                  系统托盘（运行期间常驻）                         │
│                  左键/右键弹出相同面板                            │
└─────────────────────────────────────────────────────────────────┘
```

### 路由结构

```
/                           → 重定向到 /rooms
/rooms                      → 管理面板 - 直播间（Tab: 已添加 / 搜索）
/accounts                   → 管理面板 - 账号（Tab: 登录 / 账号）
/ai                         → 管理面板 - AI 接入（Tab: 添加模型 / 已保存）
/settings                   → 管理面板 - 设置（Tab: 弹幕发送 / 弹幕接收 / 外观 / 通知）
/room/:roomId               → 弹幕页面（独立全屏布局）
```

```tsx
<Routes>
  <Route element={<AppLayout />}>
    {/* 侧边栏(w-16) + 内容区 */}
    <Route path="/rooms" element={<RoomPage />} />
    <Route path="/accounts" element={<AccountPage />} />
    <Route path="/ai" element={<AIPage />} />
    <Route path="/settings" element={<SettingsPage />} />
  </Route>
  <Route path="/room/:roomId" element={<DanmakuPage />} /> {/* 独立布局 */}
</Routes>
```

---

### 4.1 管理面板

**整体布局：** 左侧 64px 图标侧边栏 + 右侧内容区

```
┌──────────────────────────────────────────────────────┐
│  BiliDanmu (BD)                          ─  □  ✕    │
├────────────┬─────────────────────────────────────────┤
│            │                                         │
│  📺 直播间 │        页面标题 + 描述                    │
│  👤 账号   │        ──────────────────────            │
│  🤖 AI    │        [Tab A] [Tab B]                   │
│  ⚙️ 设置  │        ┌─────────────────────────────┐   │
│            │        │                             │   │
│────────────│        │     Tab 内容区               │   │
│ v0.1.2     │        │                             │   │
└────────────┴─────────────────────────────────────────┘
  侧边栏 w-16     内容区自适应
  (图标 + 左侧     (页面标题 + PageTabs + 内容)
   粉色竖条指示)
```

**侧边栏规范：**

- 宽度 `w-16`（64px），顶部 "BD" 品牌标识，仅显示图标，hover 显示文字 tooltip
- 当前选中项：左侧 3px 粉色竖条 + 背景色变化
- 底部：版本号（`v0.1.2`）
- 4 个导航项：直播间、账号、AI 接入、设置

**页面通用模式：**

所有管理页面共享相同结构：
1. 页面标题（`text-2xl font-semibold`）+ 灰色描述文案
2. 右上角操作按钮 / 状态提示（error/success）
3. `PageTabs`（Radix Tabs）切换内容区域
4. 内容区使用统一的边框卡片样式（`border-slate-300 bg-white` / 暗色 `border-white/[0.06] bg-[#12141e]`）

---

#### 子页面一：直播间（RoomPage）

**Tab 结构：** `已添加 (N)` | `搜索`

```
┌─────────────────────────────────────────────────────────┐
│  直播间                                                  │
│  添加、管理并切换当前使用的直播间。                        │
├────────────┬────────────────────────────────────────────┤
│ 已添加 (2)  │ 搜索                                       │
├────────────┴────────────────────────────────────────────┤
│                                                         │
│  ──── 搜索 Tab ────                                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │ [主播名字 ▼]  🔍 输入主播名字搜索直播间    [搜索] │   │
│  └──────────────────────────────────────────────────┘   │
│  搜索结果 (3 个)                                        │
│  ┌──────────────────┐ ┌──────────────────┐             │
│  │ 🔴 主播A  12345  │ │ 🔴 主播B  67890  │             │
│  │ 今晚继续冲！  [+] │ │ 休息一天    [+]  │             │
│  └──────────────────┘ └──────────────────┘             │
│                                                         │
│  ──── 已添加 Tab ────                                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 🔴 主播A  12345  [当前]                           │   │
│  │ 今晚继续冲！在线 · 1.2万 人                       │   │
│  │ [设为当前] [打开弹幕] [🗑]                         │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ ⚫ 主播B  67890                                   │   │
│  │ 休息一天 · 未开播                                  │   │
│  │ [设为当前] [打开弹幕] [🗑]                         │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**交互细节：**

1. 搜索模式下拉选择：主播名字 / 直播间号 / 直播链接 / UID，placeholder 随模式变化
2. 搜索结果以 2 列网格展示，每条显示直播状态圆点、主播名、标题、房间号、添加按钮
3. 已添加房间以 2 列网格卡片展示，当前房间粉色高亮 + "当前" 标签
4. 操作按钮：设为当前（持久化 currentRoomId）、打开弹幕（`open_danmaku_window`，跳转弹幕页）、删除（若删的是当前房间，同步清理持久化 currentRoomId）
5. 删除当前房间时自动保存 `selections.save({ currentRoomId: null })`

---

#### 子页面二：账号（AccountPage）

**Tab 结构：** `登录` | `账号`

```
┌─────────────────────────────────────────────────────────┐
│  账号                                                    │
│  扫码或 Cookie 登录，管理当前账号与隐身模式。              │
├────────┬────────────────────────────────────────────────┤
│ 登录   │ 账号                                           │
├────────┴────────────────────────────────────────────────┤
│                                                         │
│  ──── 登录 Tab（左右双栏） ────                          │
│  ┌─────────────────────┐ ┌─────────────────────────┐   │
│  │ 扫码登录             │ │ Cookie 登录             │   │
│  │ ┌─────────────┐     │ │ ┌───────────────────┐  │   │
│  │ │  QR 二维码   │     │ │ │  粘贴完整 Cookie  │  │   │
│  │ │  (本地生成)  │     │ │ │  字符串...         │  │   │
│  │ └─────────────┘     │ │ └───────────────────┘  │   │
│  │ [生成二维码]         │ │ [使用 Cookie 登录]      │   │
│  │ 请使用 App 扫码...   │ │ 需包含 SESSDATA         │   │
│  └─────────────────────┘ └─────────────────────────┘   │
│                                                         │
│  ──── 账号 Tab ────                                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 当前账号                              [退出登录] │   │
│  │ ┌──────────────────────────────────────────┐    │   │
│  │ │ 🖥 头像  用户A              UID: 123456   │    │   │
│  │ │         Cookie 已写入本地存储              │    │   │
│  │ │                      [发送账号: 当前账号]  │    │   │
│  │ │                      [接收账号: 设为当前]  │    │   │
│  │ └──────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 👻 隐身模式                    [开启隐身模式]    │   │
│  │ 打开后，接收侧可视为匿名模式                      │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**交互细节：**

1. **扫码登录**：点击「生成二维码」→ `qrcode` 库本地渲染 → 每 3s 轮询 `poll_qr` → 过期自动刷新 → 成功后写入 auth-store
2. **Cookie 登录**：粘贴完整 Cookie 字符串 → textarea 输入 → 提示需包含 `SESSDATA` 与 `bili_jct`
3. **当前账号卡片**：头像（ProxiedImage 代理）、用户名、UID、Cookie 状态提示
4. **发送/接收账号**：独立标记按钮，点击即切换并持久化到 `selections.save`
5. **隐身模式**：开关按钮，开启后绿色高亮，状态保存在 auth-store
6. 当前仅支持单账号登录，多账号 UI 为预留设计

---

#### 子页面三：AI 接入（AIPage）

**Tab 结构：** `添加模型` / `编辑模型` | `已保存 (N)`

```
┌─────────────────────────────────────────────────────────┐
│  AI 接入                                                 │
│  OpenAI 兼容接口的配置、测试与模型切换。                   │
├────────────┬────────────────────────────────────────────┤
│ 添加模型    │ 已保存 (2)                                  │
├────────────┴────────────────────────────────────────────┤
│                                                         │
│  ──── 添加/编辑模型 Tab ────                             │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 添加模型                          [取消编辑]      │   │
│  │ Endpoint [https://api.openai.com/v1]             │   │
│  │ API Key  [sk-••••••••]                           │   │
│  │ 模型名   [gpt-4o-mini]                           │   │
│  │ 备注     [我的 GPT-4o 账号]                       │   │
│  │                                                  │   │
│  │ 可用模型: [gpt-4o-mini] [gpt-4o] [gpt-3.5]      │   │
│  │                                                  │   │
│  │ [获取模型列表] [测试连接] [保存模型]               │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ──── 已保存 Tab ────                                   │
│  ┌──────────────────┐ ┌──────────────────┐             │
│  │ gpt-4o-mini [当前]│ │ qwen2.5:7b      │             │
│  │ api.openai.com   │ │ localhost:11434  │             │
│  │ 我的 GPT-4o 账号 │ │                  │             │
│  │ [编辑][设为当前]  │ │ [编辑][设为当前]  │             │
│  │ [删除]           │ │ [删除]           │             │
│  └──────────────────┘ └──────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

**交互细节：**

1. **添加/编辑共享表单**：同一 Tab，编辑时标题切换为「编辑模型」+ 显示「取消编辑」按钮
2. 编辑模型时 API Key 可留空（不会覆盖已保存的密钥），有提示文案
3. **获取模型列表**：调用 `/v1/models` 获取可用模型名，以可点击标签形式展示，点击即填入模型名输入框
4. **测试连接**：调用 `test_ai_connection`，结果以 cyan 色文字显示在页面顶部（如「连接成功 (328ms)」）
5. **已保存列表**：2 列网格卡片，当前模型粉色高亮 + "当前" 标签；操作：编辑、设为当前、删除
6. ID 使用时间戳 + 随机 hex 防冲突，持久化至 SQLite

---

#### 子页面四：设置（SettingsPage）

**Tab 结构：** `弹幕发送` | `弹幕接收` | `外观` | `通知`

```
┌─────────────────────────────────────────────────────────┐
│  设置                                         [保存设置] │
│  发送、接收与外观的核心设置。                              │
├────────┬──────┬──────┬──────────────────────────────────┤
│弹幕发送│弹幕接收│ 外观  │ 通知                             │
├────────┴──────┴──────┴──────────────────────────────────┤
│                                                         │
│  ──── 弹幕发送 ────                                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 最小间隔（秒） [1.5]     最大间隔（秒） [3.0]     │   │
│  │ ☑ 启用随机间隔                                    │   │
│  │ ☑ 启用间隔抖动                                    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ──── 弹幕接收 ────                                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ☑ 自动连接弹幕流    ☑ 断线自动重连                │   │
│  │ 重连间隔（秒） [5]   最大重连间隔（秒） [60]       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ──── 外观 ────                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 主题  [跟随系统 ▼]                                │   │
│  │ 弹幕字号 [14]                                     │   │
│  │ ☑ 显示勋章                                        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ──── 通知 ────                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ☑ 禁言提醒    ☑ Cookie 过期提醒                   │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**配置项清单：**

| 配置项         | 类型   | 默认值   | 说明                      | 所在 Tab |
| -------------- | ------ | -------- | ------------------------- | -------- |
| 发送最小间隔   | number | 1.5s     | 两次发送之间的最小间隔    | 弹幕发送 |
| 发送最大间隔   | number | 3.0s     | 两次发送之间的最大间隔    | 弹幕发送 |
| 随机间隔       | bool   | true     | 在 min-max 间随机选择间隔 | 弹幕发送 |
| 微扰           | bool   | true     | 间隔 ±0.3s 抖动           | 弹幕发送 |
| 自动连接弹幕流 | bool   | true     | 进入直播间自动连接 WS     | 弹幕接收 |
| 断线重连       | bool   | true     | 弹幕流断线自动重连        | 弹幕接收 |
| 重连间隔       | number | 5s       | 初始重连间隔              | 弹幕接收 |
| 最大重连间隔   | number | 60s      | 退避策略上限              | 弹幕接收 |
| 主题           | enum   | 跟随系统 | 浅色/深色/跟随系统        | 外观     |
| 弹幕字号       | number | 14px     | 弹幕流中文字大小          | 外观     |
| 显示勋章       | bool   | true     | 是否显示粉丝勋章          | 外观     |
| 禁言提醒       | bool   | true     | 禁言时弹出通知            | 通知     |
| Cookie过期提醒 | bool   | true     | Cookie 即将过期时提醒     | 通知     |

> **未接入前端但已在 Settings 类型中定义的字段：** `riskControl.autoPauseOnMute`、`riskControl.appendRandomSuffix`、`appearance.showLevel`、`notification.sendSuccess`、`notification.scAlert` — 这些在 SettingsPage 中没有对应的 UI 控件。

---

### 4.2 弹幕页面（DanmakuPage）

**全屏独立布局**，无侧边栏，进入房间后自动连接弹幕流。

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│   弹幕流区域                                                     │
│   [勋章] 用户A: 哈哈哈                                           │
│   [勋章] 用户B: [emote_img]                                      │
│   💬 用户C 大表情                                                │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │ 💰 SC 卡片：头像 + 用户名 + ¥30                          │   │
│   │ 底部：SC 消息内容                                        │   │
│   └──────────────────────────────────────────────────────────┘   │
│   🎁 用户D 送出 小电视x1                                         │
│   ↪ 用户E 进入了直播间                                           │
│                                                     [回到底部 ↓] │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  [🔁] [😊] [___输入弹幕内容___] [➤]                              │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 表情选择器 / 独轮车面板（浮动在输入栏上方）               │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

**弹幕输入栏：**

- 左侧独轮车按钮（🔁）→ 弹出 LoopSenderPanel 浮动面板
- 表情按钮（😊）→ 弹出 EmoticonPickerPanel 浮动面板
- 中间单行输入框，Enter 发送，最多 20 字
- 右侧发送按钮（➤），发送中 disabled

**表情选择器（EmoticonPickerPanel）：**

- 标题 + 关闭按钮
- 表情包横向滚动 Tab（封面图标 + 包名 tooltip），`makePkgKey(pkgId-pkgType)` 复合 key 切换
- 下方表情网格（3-6 列响应式），不可用表情灰显 + cursor-not-allowed
- 所有图片通过 `ProxiedImage` 组件自动代理 B 站 CDN

**独轮车面板（LoopSenderPanel）：**

- 多行 textarea 输入（每行一条消息）
- 间隔输入（秒，0.3s 下限）
- 启动/停止按钮
- 运行状态：已发送 N 条 / 当前第 M 条 / 停止原因
- 切换房间或组件卸载时自动停止

**弹幕流渲染规则：**

| 消息类型       | 渲染方式                                 | 样式         |
| -------------- | ---------------------------------------- | ------------ |
| 普通弹幕       | `[勋章] 用户名: 消息文本`                | slate 文字   |
| 含文字表情弹幕 | `[emote_key]` 替换为 inline `<img>`      | InlineEmotText 混排 |
| 大表情弹幕     | 仅表情图片（official_ 限制 56px）        | 居中 inline  |
| 醒目留言 (SC)  | SuperChatCard 两段式卡片（真实颜色）     | 独立卡片     |
| 礼物消息       | `🎁 用户 送出 礼物名`                    | amber 金色   |
| 进场消息       | `↪ 用户 进入了直播间`                    | 灰色小字     |

**图片代理：**

所有 B 站 CDN 图片（`*.hdslb.com`）通过 `ProxiedImage` → `useProxyImage` → `proxy_image` IPC 命令代理加载，绕过 Referer 防盗链。代理后的 base64 data URL 缓存在前端 LRU（200 条），代理失败时 fallback 到原始 URL。

---

### 4.3 系统托盘

**图标状态：**

| 应用状态     | 图标 | Tooltip                     |
| ------------ | ---- | --------------------------- |
| 未连接直播间 | 灰色 | BiliDanmu - 未连接          |
| 已连接弹幕流 | 蓝色 | BiliDanmu - 直播间名        |
| 独轮车运行中 | 绿色 | BiliDanmu - 独轮车运行中    |
| 禁言状态     | 红色 | BiliDanmu - 已禁言 (剩余Xm) |

**托盘菜单（左键/右键弹出相同菜单）：**

```
┌──────────────────────────────┐
│  BiliDanmu v0.1.0            │
│  ──────────────────────────── │
│  📺 直播间                    │
│    ● 主播A (12345)  ← 当前   │
│      主播B (67890)           │
│  ──────────────────────────── │
│  👤 账号                      │
│    ● 用户A           ← 当前   │
│      👻 隐身模式              │
│  ──────────────────────────── │
│  🤖 AI                        │
│    ● GPT-4o Mini     ← 当前   │
│      ⚪ 未启用                │
│  ──────────────────────────── │
│  🖥️ 显示主窗口                │
│  ❌ 退出                      │
└──────────────────────────────┘
```

Rust 实现要点（参考 cc-switch tray.rs）：动态构建菜单项，直播间/账号/AI 列表从 Tauri State 读取，当前选中项用 Check 标记，窗口关闭时最小化到托盘而非退出。

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
}
```

---

## 六、关键实现细节

### 6.1 WBI 签名（Rust，参考 PiliPlus/astrbot）

```rust
const MIXIN_KEY_ENC_TAB: [usize; 64] = [
    46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,
    27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,
    37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,
    22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52,
];

fn get_mixin_key(orig: &str) -> String {
    MIXIN_KEY_ENC_TAB.iter().take(32).map(|&i| orig.chars().nth(i).unwrap()).collect()
}

pub fn sign_wbi(params: &mut Vec<(&str, String)>, img_key: &str, sub_key: &str) {
    let mixin_key = get_mixin_key(&format!("{}{}", img_key, sub_key));
    let wts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    params.push(("wts", wts.to_string()));
    params.sort_by(|a, b| a.0.cmp(b.0));
    let query: String = params.iter().map(|(k, v)| format!("{}={}", k, v)).collect::<Vec<_>>().join("&");
    let digest = md5::compute(format!("{}{}", query, mixin_key));
    params.push(("w_rid", format!("{:x}", digest)));
}
```

### 6.2 弹幕发送（Rust，参考 BLSPAM/PiliPlus）

```rust
pub async fn send_danmaku(client: &reqwest::Client, room_id: u64, msg: &str, credential: &Credential, color: u32, mode: u32, dm_type: u32) -> Result<BiliResponse> {
    let rnd = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs().to_string();
    let form = [("bubble","0"),("msg",msg),("color",&color.to_string()),("mode",&mode.to_string()),("room_type","0"),("jumpfrom","0"),("reply_mid","0"),("reply_attr","0"),("reply_type","0"),("fontsize","25"),("rnd",&rnd),("roomid",&room_id.to_string()),("csrf",&credential.bili_jct),("csrf_token",&credential.bili_jct),("dm_type",&dm_type.to_string())];
    let resp = client.post("https://api.live.bilibili.com/msg/send").form(&form).header("Cookie", credential.cookie_header()).send().await?;
    Ok(resp.json().await?)
}
```

### 6.3 WebSocket 二进制协议（Rust，参考 astrbot/bilibili-api）

```rust
/// 16 字节包头（大端序）:
/// [0..4] pack_len:u32  [4..6] header_size:u16  [6..8] protover:u16
/// [8..12] operation:u32  [12..16] sequence:u32

pub const HEADER_SIZE: usize = 16;
pub const OP_HEARTBEAT: u32 = 2;
pub const OP_AUTH: u32 = 7;

impl PacketHeader {
    pub fn from_bytes(data: &[u8]) -> Self { /* 大端序解析 */ }
    pub fn auth_packet(room_id: u64, uid: u64, key: &str) -> Vec<u8> { /* op=7 构造 */ }
    pub fn heartbeat_packet() -> Vec<u8> { /* op=2 构造 */ }
}
```

### 6.4 前端 Tauri IPC 封装

```typescript
// src/lib/tauri.ts
export const tauriCommands = {
  auth: {
    loginByQr: () => invoke<QrLoginResult>("login_by_qr"),
    pollQr: (qrcodeKey: string) => invoke<QrPollResult>("poll_qr", { qrcodeKey }),
    loginByCookie: (cookie: string) => invoke<Credential>("login_by_cookie", { cookie }),
    checkLoginStatus: () => invoke<LoginStatus>("check_login_status"),
    restoreLogin: () => invoke<Credential | null>("restore_login"),
    logout: () => invoke<void>("logout"),
  },
  danmaku: {
    send: (roomId: number, msg: string, opts?: SendOptions) =>
      invoke<BiliResponse>("send_danmaku", { roomId, msg, ...opts }),
    sendEmoticon: (roomId: number, emoticonUnique: string, opts?: SendEmoticonOptions) =>
      invoke<BiliResponse>("send_emoticon", { roomId, emoticonUnique, ...opts }),
    startLoop: (roomId: number, messages: string[], intervalMs: number) =>
      invoke<void>("start_loop_send", { roomId, messages, intervalMs }),
    stopLoop: () => invoke<void>("stop_loop_send"),
  },
  room: {
    search: (query: string, mode: SearchRoomMode) =>
      invoke<SearchRoomResult[]>("search_room", { query, mode }),
    add: (roomId: number) => invoke<RoomInfo>("add_room", { roomId }),
    remove: (roomId: number) => invoke<void>("remove_room", { roomId }),
    getInfo: (roomId: number) => invoke<RoomInfo>("get_room_info", { roomId }),
    getEmoticons: (roomId: number) =>
      invoke<EmoticonPackage[]>("get_emoticons", { roomId }),
    openDanmaku: (roomId: number) => invoke<void>("open_danmaku_window", { roomId }),
  },
  ws: {
    connect: (roomId: number) => invoke<void>("connect_danmaku_stream", { roomId }),
    disconnect: () => invoke<void>("disconnect_danmaku_stream"),
  },
  ai: {
    addModel: (input: AIModelInput) => invoke<AIModel>("add_ai_model", { input }),
    getModels: () => invoke<AIModel[]>("get_ai_models"),
    testConnection: (input: AIModelInput) => invoke<TestResult>("test_ai_connection", { input }),
    fetchModels: (endpoint: string, apiKey: string) =>
      invoke<string[]>("fetch_models", { endpoint, apiKey }),
    setCurrentModel: (id: string) => invoke<void>("set_current_model", { id }),
    updateModel: (id: string, input: AIModelInput) =>
      invoke<AIModel>("update_ai_model", { id, input }),
    deleteModel: (id: string) => invoke<void>("delete_ai_model", { id }),
  },
  settings: {
    get: () => invoke<Settings>("get_settings"),
    update: (settings: Settings) => invoke<void>("update_settings", { settings }),
  },
  state: {
    getRooms: () => invoke<Room[]>("get_rooms"),
  },
  selections: {
    load: (keys: string[]) => invoke<Record<string, unknown>>("load_selections", { keys }),
    save: (entries: Record<string, unknown>) => invoke<void>("save_selections", { entries }),
  },
  proxy: {
    image: (url: string) => invoke<string>("proxy_image", { url }),
  },
};
```

### 6.5 速率限制器（Rust，参考 BLSPAM）

```rust
pub struct RateLimiter { min_interval_ms: u64, max_interval_ms: u64, window_limit: usize, window_secs: u64, send_timestamps: Vec<u64> }

impl RateLimiter {
    pub async fn wait_for_permit(&mut self) {
        // 滑动窗口检查 → 随机间隔 (1.5-3s) → 记录时间戳
    }
}
```

---

## 七、Tauri IPC 命令汇总

### 命令

| 命令                        | 参数                                    | 返回                      | 说明               |
| --------------------------- | --------------------------------------- | ------------------------- | ------------------ |
| `login_by_qr`               | -                                       | `{ url, qrcode_key }`     | 生成二维码登录 URL |
| `poll_qr`                   | `qrcode_key`                            | `QrPollResult`            | 轮询扫码结果       |
| `login_by_cookie`           | `cookie`                                | `Credential`              | Cookie 登录        |
| `check_login_status`        | -                                       | `LoginStatus`             | 检查登录状态       |
| `restore_login`             | -                                       | `Credential \| null`      | 恢复已保存的登录   |
| `logout`                    | -                                       | void                      | 登出并清除凭据     |
| `search_room`               | `query, mode`                           | `SearchRoomResult[]`      | 搜索直播间         |
| `add_room`                  | `room_id`                               | `RoomInfo`                | 添加直播间         |
| `remove_room`               | `room_id`                               | void                      | 移除直播间         |
| `get_room_info`             | `room_id`                               | `RoomInfo`                | 直播间详情         |
| `get_danmu_info`            | `room_id`                               | 弹幕服务器信息            | 获取弹幕服务器信息 |
| `get_rooms`                 | -                                       | `Room[]`                  | 获取已添加房间列表 |
| `get_emoticons`             | `room_id`                               | `EmoticonPackage[]`       | 获取表情列表       |
| `open_danmaku_window`       | `room_id`                               | void                      | 打开弹幕子窗口     |
| `send_danmaku`              | `room_id, msg, color?, mode?`           | `BiliResponse`            | 发送文字弹幕       |
| `send_emoticon`             | `room_id, emoticon_unique, emoticon_options?` | `BiliResponse`            | 发送表情弹幕       |
| `start_loop_send`           | `room_id, messages[], interval_ms`      | void                      | 开始循环发送（最小 300ms） |
| `stop_loop_send`            | -                                       | void                      | 停止循环发送       |
| `connect_danmaku_stream`    | `room_id`                               | void                      | 连接弹幕流         |
| `disconnect_danmaku_stream` | -                                       | void                      | 断开弹幕流         |
| `add_ai_model`              | `input: AIModelInput`                   | `AIModel`                 | 添加模型           |
| `get_ai_models`             | -                                       | `AIModel[]`               | 获取所有模型       |
| `test_ai_connection`        | `input: AIModelInput`                   | `TestResult`              | 测试连接           |
| `fetch_models`              | `endpoint, api_key`                     | `string[]`                | 获取可用模型       |
| `set_current_model`         | `id`                                    | void                      | 切换当前模型       |
| `update_ai_model`           | `id, input: AIModelInput`               | `AIModel`                 | 更新模型           |
| `delete_ai_model`           | `id`                                    | void                      | 删除模型           |
| `proxy_image`               | `url`                                   | `string`（data URI）      | 代理图片（SSRF 白名单 + 5MB 限制） |
| `get_settings`              | -                                       | `Settings`                | 获取设置           |
| `update_settings`           | `settings`                              | void                      | 更新设置           |
| `load_selections`           | `keys: string[]`                        | `Record<string, unknown>` | 批量读取选择项     |
| `save_selections`           | `entries: Record<string, unknown>`      | void                      | 批量保存选择项（事务） |

> **计划中但未实现的命令：** `export_config`、`import_config`、`remove_account`

### 事件（Rust → 前端）

| 事件名             | Payload             | 说明         |
| ------------------ | ------------------- | ------------ |
| `danmaku-received` | `DanmakuMessage`    | 收到弹幕     |
| `gift-received`    | `GiftMessage`       | 收到礼物     |
| `sc-received`      | `SuperChatMessage`  | 收到醒目留言 |
| `danmaku-sent`     | `{ msg, success }`  | 弹幕发送结果 |
| `danmaku-muted`    | `{ remain_sec }`    | 被禁言       |
| `danmaku-error`    | `{ code, message }` | 弹幕流错误   |
| `ws-connected`     | `{ room_id }`       | 弹幕流已连接 |
| `ws-disconnected`  | `{ reason }`        | 弹幕流断开   |
| `ws-heartbeat`     | `{ popularity }`    | 心跳/人气值  |
| `loop-send-tick`   | `{ roomId, message, index }` | 循环发送成功 |
| `loop-send-error`  | `{ roomId, message, index, error }` | 循环发送失败 |
| `loop-send-stopped`| `{ reason }`        | 循环发送停止 |

---

## 八、下一步详细行动清单

### Phase 1：项目骨架 & Tauri 环境（Day 1-2） ✅ 已完成

- [x] **1.1** 初始化 Tauri 2 + React 项目
  - [x] `npm create tauri-app`（React + TypeScript 模板）
  - [x] 安装依赖：react-router, zustand, @tanstack/react-query, @tauri-apps/api, @tauri-apps/plugin-store
  - [x] 初始化 shadcn/ui（`npx shadcn@latest init`）
  - [x] 配置 TailwindCSS 3 + postcss
  - [x] 配置 `tauri.conf.json`（960×680，最小 800×600，标题 BiliDanmu）
  - [x] 验证 `cargo check` 通过（0 错误）

- [x] **1.2** 配置 Rust 依赖
  - [x] Cargo.toml：reqwest, tokio-tungstenite, brotli, flate2, md-5, serde_json, rand, url, tauri-plugin-store, tauri-plugin-shell, tauri-plugin-log
  - [x] 配置 `capabilities/default.json`

- [x] **1.3** 搭建前端骨架
  - [x] React Router 路由（/rooms, /accounts, /ai, /settings, /room/:roomId）
  - [x] Zustand stores 创建（5 个 store）
  - [x] TanStack QueryProvider
  - [x] AppLayout（64px 侧边栏 + 内容区）
  - [x] TypeScript 类型检查通过（0 错误）

### Phase 2：Rust 后端 — 认证 & WBI 签名（Day 3-4） ✅ 已完成

- [x] **2.1** `bili/credential.rs` — Credential 结构体、Cookie 解析、校验、持久化
  - [x] Cookie 字符串解析（SESSDATA, bili_jct, buvid3/4, DedeUserID, ac_time_value）
  - [x] `cookie_map()` / `cookie_header()` / `validate_for_send()` / `csrf()`
  - [x] SESSDATA percent-encode 处理
  - [x] 单元测试
- [x] **2.2** `bili/wbi.rs` — 混淆表、sign_wbi、密钥动态获取与缓存
  - [x] MIXIN_KEY_ENC_TAB、get_mixin_key、sign_wbi 完整实现
  - [x] 参数排序、过滤 `!'()*`、编码、MD5 生成 w_rid
  - [x] `extract_wbi_key_from_url` 从 URL 提取密钥
  - [x] 单元测试
  - [x] WbiKeyCache：从 `/x/web-interface/nav` 动态获取 + 12h TTL 缓存
- [x] **2.3** `bili/buvid.rs` — buvid3/4 真实生成（随机 hex + 时间戳 + "infoc" 后缀）+ `ensure_buvid` 自动补充
- [x] **2.4** `commands/auth.rs` — 认证命令已接入真实 API
  - [x] login_by_cookie 使用 BiliCredential 解析 + 校验 + 写入 AppState
  - [x] 登录后调用 nav() 校验 Cookie 有效性
  - [x] check_login_status 调用 `/x/web-interface/nav` 真实校验
  - [x] 账号持久化：credential_store.rs（cookie 本地存储）+ restore_login + logout
  - [x] App.tsx 启动时自动恢复登录状态
  - [x] login_by_qr 二维码登录（真实 API + Set-Cookie 提取 + complete_login_with_cookie 共享逻辑）
  - [x] AccountPage 扫码 UI（本地 QR 生成 via qrcode 库 + 3s 轮询 + 过期自动刷新 + 七种状态文案）

### Phase 3：Rust 后端 — 弹幕发送 & API（Day 5-7） ✅ 已完成

- [x] **3.1** `bili/api.rs` — 真实 HTTP 请求层
  - [x] BiliApiClient（reqwest + User-Agent + Referer + Cookie 自动附加）
  - [x] nav() — 获取用户信息 + WBI 密钥
  - [x] get_room_info() — 直播间详情
  - [x] get_danmu_info() — 弹幕服务器信息（WBI 签名）
  - [x] resolve_room_by_uid() — UID 查询直播间
  - [x] search_rooms_by_name() — 主播名搜索（search_type=live，清除 <em> 标签）
  - [x] verify_login_status() — Cookie 有效性校验
  - [x] send_danmaku / send_emoticon — 真实 POST 到 api.live.bilibili.com/msg/send
  - [x] get_emoticons — 获取房间表情列表（GetEmoticons API + parse_emoticon_package/parse_emoticon）
- [x] **3.2** `bili/rate_limiter.rs` — 已删除（个人使用场景不需要，0.3s 下限已够用）
- [x] **3.3** `commands/danmaku.rs` — send_danmaku, send_emoticon 命令已接入
  - [x] `send_danmaku`: POST `https://api.live.bilibili.com/msg/send`，form 参数：roomid, msg, color(16777215), fontsize(25), mode(1), rnd(时间戳), bubble(0), csrf(bili_jct), csrf_token(bili_jct), dm_type(0)
  - [x] `send_emoticon`: 同上 + dm_type=1 + emoticon_options JSON（支持 API 返回的 emoticon_options 直传）
  - [x] 需要 Credential（bili_jct + cookie），从 AppState 获取
  - [x] `start_loop_send` / `stop_loop_send` 真实实现（oneshot 控制 + tokio::spawn 循环 + loop-send-tick/error/stopped 事件）
- [x] **3.4** `commands/room.rs` — 搜索与房间信息已接入真实 API
  - [x] search_room 按 mode 分支：roomId/link 走直查，uid 走 UID 查询，name 走真实搜索
  - [x] add_room 调用真实 get_room_info + 本地持久化（room_store.rs）
  - [x] remove_room 同步删除本地存储
  - [x] get_rooms 从本地 rooms.json 加载
  - [x] get_danmu_info 已暴露为 IPC 命令
  - [x] AppState 注入（credential + wbi_cache）
  - [x] build_api_client 提取到 commands/mod.rs 公共函数
  - [x] 前端 addRoom 改为调用后端 add_room（持久化闭环）

### Phase 4：Rust 后端 — WebSocket 弹幕接收（Day 8-10）

- [x] **4.1** `bili/protocol.rs` — 二进制协议实现
  - [x] PacketHeader 结构体：pack_len(u32) + header_size(u16) + ver(u16) + operation(u32) + seq_id(u32)，大端序
  - [x] 操作码常量：OP_AUTH(7), OP_AUTH_REPLY(8), OP_HEARTBEAT(2), OP_HEARTBEAT_REPLY(3), OP_SEND_MSG(5)
  - [x] `auth_packet(room_id, uid, buvid, key)` 构造 op=7 包，body JSON：{uid, roomid, protover:3, platform:"web", type:2, buvid, key}
  - [x] `heartbeat_packet()` 构造 op=2 空包
  - [x] `decode_packets(data)` 解析：循环读取 pack_len 长度的包，ver=3 时 Brotli 解压后递归解析，ver=2 时 zlib 解压，ver=0/1 直接 JSON
  - [x] 消息解析：parse_danmaku_command 解析 DANMU_MSG + SEND_GIFT + INTERACT_WORD + SUPER_CHAT_MESSAGE（含真实颜色字段）
- [x] **4.2** `bili/ws_client.rs` — WebSocket 客户端
  - [x] `connect(room_id)`: 调用 get_danmu_info 获取 token + host_list → 连接 `wss://{host}:{wss_port}/sub`
  - [x] 5 秒内发送 auth 包（op=7），等待 auth_reply（op=8）确认
  - [x] 每 30 秒发送心跳包（op=2），解析 heartbeat_reply 获取在线人气
  - [x] 接收消息：Brotli 解压 → 解析 JSON → 通过 Tauri event emit 到前端
  - [x] 自动重连：断线后按退避策略重连（5s → 10s → 30s → 60s）
  - [x] 匿名模式：uid=0，不携带 cookie
  - [x] 心跳任务显式 abort（主循环退出时）
- [x] **4.3** `commands/websocket.rs` — connect/disconnect、事件：danmaku-received, danmaku-error, ws-connected, ws-heartbeat

### Phase 5：前端页面开发（Day 11-14）

- [x] **5.1** 子页面一：RoomPage（添加/切换直播间） ✅ 真实 UI 骨架
  - [x] 搜索模式切换（主播名/直播间号/链接/UID）
  - [x] 搜索输入 + 回车搜索 + loading/error 状态
  - [x] 搜索结果列表 + 添加房间
  - [x] 已添加直播间列表（设为当前/进入/移除）
  - [x] room-store.ts 新增 searchResults/addRoom/removeRoom
- [x] **5.2** 子页面二：AccountPage ✅ 完整版（扫码登录 + Cookie 登录、本地 QR 生成、过期自动刷新、账号展示、发送/接收标记、退出登录、隐身模式开关）
- [x] **5.3** 子页面三：AIPage ✅ 最小真实版（ai_store.rs 持久化 + IPC 命令：保存/加载/测试连接/获取模型列表/切换当前/编辑/删除）
- [x] **5.4** 子页面四：SettingsPage ✅ 最小可用闭环（settings_store.rs 持久化 + IPC 命令 + 前端表单：发送间隔/接收/外观/通知核心子集）
- [x] **5.5** 发送弹幕页面：DanmakuPage（组件化拆分 + 基础实时弹幕页）
  - [x] 进入房间自动连接弹幕流，离开自动断开
  - [x] 监听 danmaku-received/ws-connected/ws-disconnected/danmaku-error/ws-heartbeat 事件
  - [x] 实时弹幕流渲染（用户名、勋章、房管标记、弹幕内容）
  - [x] 弹幕自动滚动到底部 + 回到底部浮动按钮（向上滚动时出现）
  - [x] 时间戳显示（HH:mm）+ 非默认色弹幕渲染对应颜色
  - [x] 人气值展示（ws-heartbeat 事件，侧边栏 + 弹幕区顶栏）
  - [x] 输入栏 + Enter 发送 + 20 字限制 + 发送中状态
  - [x] WS 状态指示（连接中/已连接/重连中/错误）
  - [x] 发送统计与错误显示
  - [x] 表情选择器（懒加载、包切换、网格展示、可用性判断、点击发送）
  - [x] 组件化拆分第一轮：SuperChatCard / DanmakuMessageItem / InlineEmotText / EmoticonPickerPanel
  - [x] 组件化拆分第二轮：LoopSenderPanel（独轮车面板独立组件）
  - [x] 独轮车完整版（useScheduler + 多行输入 + 间隔 + 启动/停止 + 运行态/错误 + 切房自动停 + 发送计数 + 条目索引 + 停止原因）
  - [x] 礼物消息（SEND_GIFT 解析 + amber 卡片样式 + 礼物名显示）
  - [x] 进场消息（INTERACT_WORD 解析 + 新旧结构兼容 + msg_type 映射 + 轻量卡片）
  - [x] SC 消息（SUPER_CHAT_MESSAGE + 真实颜色两段式卡片 + 背景装饰图 + 价格标签）
  - [x] inline 表情渲染（emots 从 info[0][15].extra 解析 + InlineEmoticon 类型 + renderInlineEmots 正则替换 + key 长度降序防短 token 抢先匹配）
  - [x] 大表情渲染（dmType=1 + info[0][13] emoticon_options 解析 + BigEmoticonOptions 类型 + PiliPlus 尺寸策略：official_ 原始宽高 / 其他 162×162）

### Phase 6：完善 & 打包发布（Day 15-18）

- [x] **6.1** 系统托盘（tray.rs） ✅ 动态菜单（账号/房间/AI 状态展示 + 状态变化自动刷新 + 显示窗口/退出）
- [x] **6.2** 打包发布 ✅ GitHub Actions CI/CD（`.github/workflows/publish-tauri.yml`，Windows/macOS/Linux 多平台，tag 触发自动构建 + Draft Release）
- [ ] **6.3** 配置导出/导入（export_config / import_config IPC 命令）
- [ ] **6.4** 账号移除命令（remove_account，当前仅 logout）

---

## 九、依赖清单

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
    "@radix-ui/react-tabs": "^1.1"
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

[profile.release]
codegen-units = 1
lto = "thin"
opt-level = "s"
strip = "symbols"
```

---

## 十、风险与注意事项

1. **Cookie 过期**：SESSDATA 有效期有限，需要提醒用户定期更新
2. **API 变动**：B站接口可能随时变动，需要关注 bilibili-API-collect 的更新
3. **WBI 签名**：混淆表可能更新，需要从 API 动态获取并缓存
4. **buvid 格式兼容**：当前 buvid 生成基于随机 hex + 时间戳，若 Bilibili 更新格式校验规则需跟进
5. **WebView2**：Tauri 2 在 Windows 上依赖 WebView2 运行时（Win10 1903+ 内置，Win7 需额外安装）
6. **合规性**：本项目仅供个人学习与自用，仍应避免滥用发送能力

---

## 十一、未完成项

### 必做

| # | 项目 | 说明 |
|---|---|---|
| 6.3 | 配置导出/导入 | IPC 命令表中 `export_config` / `import_config` 已规划但未实现 |
| 6.4 | 账号移除命令 | IPC 命令表中 `remove_account` 已规划但未实现（当前仅 `logout`） |

### 可选扩展

| 功能 | 说明 |
|---|---|
| 表情独轮车 Tab | 规划中 EmotionSpamTab，当前独轮车仅支持文字 |
| 收藏夹独轮车 Tab | 规划中 FavoritesSpamTab，收藏标签 + 消息管理 |

### 可选增强

| 功能 | 说明 |
|---|---|
| Cookie 有效期提醒 | AccountPage 展示了账号信息但未做过期倒计时（🟡 即将过期 / 🔴 已过期） |
| 禁言检测与自动停车 | 设置中有 `autoPauseOnMute` 选项但前端未接入禁言事件 |
| 弹幕流左栏 | DanmakuPage 仅实现了右栏弹幕流 + 底部输入栏，左栏直播间信息区/快捷操作/发送统计未实现 |
