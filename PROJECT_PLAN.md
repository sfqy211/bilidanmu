# BiliDanmu - B站直播间弹幕发送客户端 项目规划

> 基于 7 个参考项目的深度分析，规划一个 Windows 桌面端 B站直播间弹幕发送客户端。

---

## 一、核心需求分析

从参考项目中提炼出的核心功能矩阵：

| 功能 | 来源参考 | 优先级 |
|------|---------|--------|
| 直播间文字弹幕发送 | BLSPAM, PiliPlus, bilibili-api | P0 |
| 直播间表情弹幕发送 | BLSPAM, PiliPlus, simple_live_app | P0 |
| Cookie 认证 | 全部项目 | P0 |
| WBI 签名 | bilibili-api, PiliPlus, astrbot | P0 |
| 二维码登录 | bilibili-api, PiliPlus | P1 |
| 直播间弹幕接收（WebSocket） | astrbot, bilibili-api, PiliPlus | P1 |
| 弹幕发送间隔/队列控制 | BLSPAM | P1 |
| 消息模板/收藏夹循环发送 | BLSPAM | P2 |
| 多直播间支持 | - | P2 |
| 速率限制/风控规避 | bilibili-api（反爬策略） | P1 |
| 系统托盘 | cc-switch | P2 |

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

| 层级 | 技术选择 | 理由 |
|------|---------|------|
| **桌面框架** | Tauri 2 | 3-8 MB 安装包（对比 Electron 150-200 MB），cc-switch 生产验证 |
| **前端框架** | React 18 + TypeScript | cc-switch 参考项目即 React 18 + Tauri 2，可直接复用架构模式 |
| **UI 组件库** | shadcn/ui | cc-switch 已验证与 Tauri 2 配合，可定制性极强，基于 Radix UI |
| **样式方案** | TailwindCSS 4 | 原子化 CSS，shadcn/ui 依赖，cc-switch 已验证 |
| **状态管理** | Zustand | 轻量极简，cc-switch 已使用，比 Redux/Jotai 更适合此规模项目 |
| **数据请求** | TanStack Query | 异步状态管理（API 调用、缓存、重试），cc-switch 已使用 |
| **路由** | React Router 7 | React 生态标准，成熟稳定 |
| **构建工具** | Vite 6 | Tauri 2 默认集成，HMR 极速 |
| **Rust HTTP** | reqwest | Tauri 异步 HTTP 客户端，cc-switch 已引入 |
| **Rust WebSocket** | tokio-tungstenite | 异步 WS 客户端，适合弹幕流长连接 |
| **Rust 压缩** | brotli + flate2 | 协议解压需求，cc-switch Cargo.toml 已声明 |
| **Rust 加密** | md-5 crate | WBI 签名 MD5 计算 |
| **数据持久化** | tauri-plugin-store | 轻量 KV 存储（Cookie/配置），cc-switch 已集成 |
| **系统托盘** | tauri tray-icon | 内置支持，cc-switch tray.rs 可直接参考 |

### 为什么选 React 而非 Vue？

| 对比维度 | React 18 | Vue 3 |
|---------|:---:|:---:|
| cc-switch 参考价值 | ★★★★★ **完全匹配** | ★★ 需自行转换 |
| UI 组件库生态 | ★★★★★ shadcn/ui (cc-switch验证) | ★★★ Naive UI |
| 状态管理 | ★★★★ Zustand (cc-switch验证) + TanStack Query | ★★★★ Pinia |

**关键决策理由：**

1. **cc-switch 是 React + Tauri 2 的完整参考**：从 `tray.rs` 到 hooks，从 `Cargo.toml` 到 `tauri.conf.json`，全部可直接借鉴
2. **shadcn/ui 比 Naive UI 更适合桌面应用**：组件可复制进项目完全控制样式
3. **TanStack Query 天然适合 IPC 异步调用**：`useQuery` 封装 `invoke()` 自动处理 loading/error/cache
4. **BLSPAM（Vue 3）的 API 逻辑层可独立参考**：`src/utils/bili/index.ts` 是纯 TypeScript，框架无关

---

## 三、项目结构设计

```
bilidanmu/
├── package.json                        # 前端依赖 & scripts
├── bun.lockb
├── vite.config.ts                      # Vite 构建配置
├── tsconfig.json
├── tsconfig.node.json
├── components.json                     # shadcn/ui 配置
├── tailwind.config.ts
├── postcss.config.js
├── .gitignore
│
├── src/                                # ═══ 前端 (React 18 + TypeScript) ═══
│   ├── main.tsx                        # React 入口
│   ├── App.tsx                         # 根组件（路由 + 布局）
│   ├── index.css                       # 全局样式 + TailwindCSS
│   │
│   ├── components/                     # 组件
│   │   ├── ui/                         # shadcn/ui 基础组件（自动生成）
│   │   │
│   │   ├── layout/                     # 布局组件
│   │   │   ├── AppLayout.tsx           # 主布局（侧边栏 + 内容区）
│   │   │   ├── AppSidebar.tsx          # 侧边栏导航（64px 图标式）
│   │   │   └── AppHeader.tsx           # 顶部栏
│   │   │
│   │   ├── auth/                       # 认证组件
│   │   │   ├── QrLogin.tsx             # 二维码登录
│   │   │   ├── CookieInput.tsx         # Cookie 手动输入
│   │   │   └── AccountCard.tsx         # 账号卡片
│   │   │
│   │   ├── room/                       # 直播间组件
│   │   │   ├── RoomCard.tsx            # 直播间卡片
│   │   │   ├── AddRoomDialog.tsx       # 添加直播间对话框
│   │   │   └── RoomSearchInput.tsx     # 搜索输入
│   │   │
│   │   ├── danmaku/                    # 弹幕相关组件
│   │   │   ├── DanmakuInputBar.tsx     # 弹幕输入栏
│   │   │   ├── DanmakuStream.tsx       # 实时弹幕流展示
│   │   │   ├── DanmakuMessage.tsx      # 单条弹幕渲染（含表情图片解析）
│   │   │   ├── EmoticonRenderer.tsx    # inline 表情图片渲染
│   │   │   ├── EmoticonPicker.tsx      # 表情选择器面板
│   │   │   ├── SuperChatCard.tsx       # 醒目留言卡片
│   │   │   └── GiftMessage.tsx         # 礼物消息渲染
│   │   │
│   │   ├── sender/                     # 独轮车/发送引擎组件
│   │   │   ├── AutoSpamPanel.tsx       # 独轮车面板（可展开/折叠）
│   │   │   ├── TextSpamTab.tsx         # 文字独轮车 Tab
│   │   │   ├── EmotionSpamTab.tsx      # 表情独轮车 Tab
│   │   │   └── FavoritesSpamTab.tsx    # 收藏夹独轮车 Tab
│   │   │
│   │   ├── ai/                         # AI 接入组件
│   │   │   ├── AddModelDialog.tsx      # 添加/编辑模型对话框
│   │   │   ├── ModelCard.tsx           # 模型卡片
│   │   │   ├── ConnectionTest.tsx      # 连接测试按钮
│   │   │   └── HealthBadge.tsx         # 健康状态徽章
│   │   │
│   │   └── settings/                   # 设置组件
│   │       ├── RateLimitSection.tsx    # 速率配置
│   │       ├── AppearanceSection.tsx   # 外观配置
│   │       └── AboutSection.tsx        # 关于
│   │
│   ├── pages/                          # 页面
│   │   ├── RoomPage.tsx                # 子页面一：直播间管理
│   │   ├── AccountPage.tsx             # 子页面二：账号管理
│   │   ├── AIPage.tsx                  # 子页面三：AI 接入
│   │   ├── SettingsPage.tsx            # 子页面四：设置
│   │   └── DanmakuPage.tsx             # 发送弹幕页面（独立布局）
│   │
│   ├── hooks/                          # React Hooks
│   │   ├── useAuth.ts                  # 认证状态
│   │   ├── useDanmaku.ts              # 弹幕发送逻辑
│   │   ├── useDanmakuStream.ts        # WebSocket 弹幕流监听
│   │   ├── useRoom.ts                 # 直播间管理
│   │   ├── useScheduler.ts            # 发送调度
│   │   └── useTauriEvent.ts           # Tauri 事件监听通用 Hook
│   │
│   ├── stores/                         # Zustand 状态管理
│   │   ├── auth-store.ts               # 认证状态
│   │   ├── room-store.ts               # 直播间状态
│   │   ├── danmaku-store.ts            # 弹幕数据
│   │   ├── ai-store.ts                 # AI 模型状态
│   │   └── settings-store.ts           # 应用设置
│   │
│   ├── lib/                            # 工具 & 封装
│   │   ├── tauri.ts                    # Tauri invoke/listen 类型安全封装
│   │   ├── utils.ts                    # 通用工具（cn, formatDate 等）
│   │   └── constants.ts                # 常量定义
│   │
│   └── types/                          # TypeScript 类型定义
│       ├── bilibili.ts                  # B站 API 响应类型
│       ├── danmaku.ts                  # 弹幕类型
│       └── config.ts                   # 配置类型
│
├── src-tauri/                          # ═══ 后端 (Rust) ═══
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/
│   │
│   └── src/
│       ├── lib.rs                      # Tauri 入口
│       ├── main.rs                     # 主入口
│       │
│       ├── commands/                   # Tauri IPC 命令
│       │   ├── mod.rs
│       │   ├── auth.rs                 # 认证命令
│       │   ├── danmaku.rs              # 弹幕发送命令
│       │   ├── room.rs                 # 直播间信息命令
│       │   ├── ai.rs                   # AI 模型命令
│       │   └── websocket.rs            # WebSocket 控制命令
│       │
│       ├── bili/                       # B站协议实现
│       │   ├── mod.rs
│       │   ├── credential.rs           # 凭证管理
│       │   ├── wbi.rs                  # WBI 签名
│       │   ├── buvid.rs                # buvid 生成
│       │   ├── api.rs                  # HTTP API 封装（reqwest）
│       │   ├── protocol.rs             # WebSocket 二进制协议
│       │   ├── ws_client.rs            # WebSocket 客户端
│       │   └── rate_limiter.rs         # 速率限制器
│       │
│       ├── tray.rs                     # 系统托盘
│       │
│       └── models/                     # 数据模型
│           ├── mod.rs
│           ├── message.rs
│           └── room.rs
│
└── scripts/
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
│  │  api.rs · ws_client · credential · wbi · rate_limiter │   │
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

三类页面：**主页面**（管理面板）、**发送弹幕页面**（使用面板）、**系统托盘页面**。

```
┌─────────────────────────────────────────────────────────────────┐
│                         BiliDanmu                               │
├─────────────┬───────────────────────────────────────────────────┤
│             │                                                   │
│  主页面      │  发送弹幕页面（直播间主界面）                      │
│  (管理面板)  │  (使用面板，从主页面子页面一进入)                   │
│             │                                                   │
│  ┌────────┐ │  ┌─────────────────────────────────────────────┐ │
│  │子页面一│ │  │          哔哩哔哩直播姬风格 UI                │ │
│  │直播间  │──┼─→│  弹幕流 + 发送栏 + 独轮车 + 表情            │ │
│  ├────────┤ │  └─────────────────────────────────────────────┘ │
│  │子页面二│ │                                                   │
│  │账号    │ │                                                   │
│  ├────────┤ │                                                   │
│  │子页面三│ │                                                   │
│  │AI 接入 │ │                                                   │
│  ├────────┤ │                                                   │
│  │子页面四│ │                                                   │
│  │设置    │ │                                                   │
│  └────────┘ │                                                   │
├─────────────┴───────────────────────────────────────────────────┤
│                  系统托盘（运行期间常驻）                         │
│                  左键/右键弹出相同面板                            │
└─────────────────────────────────────────────────────────────────┘
```

### 路由结构

```
/                           → 重定向到 /rooms
/rooms                      → 主页面 - 子页面一（直播间）
/accounts                   → 主页面 - 子页面二（账号）
/ai                         → 主页面 - 子页面三（AI 接入）
/settings                   → 主页面 - 子页面四（设置）
/room/:roomId               → 发送弹幕页面（独立全屏布局）
```

```tsx
<Routes>
  <Route element={<AppLayout />}>            {/* 侧边栏+内容区 */}
    <Route path="/rooms" element={<RoomPage />} />
    <Route path="/accounts" element={<AccountPage />} />
    <Route path="/ai" element={<AIPage />} />
    <Route path="/settings" element={<SettingsPage />} />
  </Route>
  <Route path="/room/:roomId" element={<DanmakuPage />} />  {/* 独立布局 */}
</Routes>
```

---

### 4.1 主页面（管理面板）

**整体布局：** 左侧 64px 图标侧边栏 + 右侧内容区

```
┌──────────────────────────────────────────────────────┐
│  BiliDanmu                              ─  □  ✕     │
├────────────┬─────────────────────────────────────────┤
│            │                                         │
│  📺 直播间 │        (子页面内容区)                     │
│  👤 账号   │                                         │
│  🤖 AI    │                                         │
│  ⚙️ 设置  │                                         │
│            │                                         │
│────────────│                                         │
│ v0.1.0     │                                         │
└────────────┴─────────────────────────────────────────┘
  侧边栏 64px    内容区自适应 (最小 600px)
  (仅图标,
   hover 文字提示)
```

**侧边栏规范：**
- 宽度 64px，仅显示图标，hover 显示文字 tooltip
- 当前选中项：左侧 3px 蓝色竖条 + 图标高亮 + 背景色变化
- 底部：版本号

---

#### 子页面一：直播间

**功能：添加/管理/切换直播间，进入发送弹幕页面**

```
┌─────────────────────────────────────────────────────────┐
│  直播间                                           + 添加 │
├─────────────────────────────────────────────────────────┤
│  ┌─ 添加直播间对话框 ──────────────────────────────────┐ │
│  │  添加方式:  ○ 主播名字  ○ 直播间号  ○ 链接  ○ UID   │ │
│  │  ┌───────────────────────────────────────────────┐  │ │
│  │  │  输入主播名字 / 直播间号 / 链接 / UID...      │  │ │
│  │  └───────────────────────────────────────────────┘  │ │
│  │  搜索结果:                                          │ │
│  │  🖼 主播A  房间号: 12345  🔴直播中                  │ │
│  │  🖼 主播B  房间号: 67890  ⚫未开播                  │ │
│  │                          [取消]  [添加]             │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  已添加的直播间                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🔴 主播A    房间号: 12345   在线: 1.2万    →进入 │   │
│  │    标题: 今晚继续冲！                              │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ ⚫ 主播B    房间号: 67890   在线: -        →进入 │   │
│  │    标题: 休息一天                                   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ☑ 当前直播间: 主播A (12345)     [移除]                 │
│                          [进入直播间 →]                  │
└─────────────────────────────────────────────────────────┘
```

**交互细节：**

1. 四种添加方式通过 Radio Group 切换，输入框 placeholder 随模式变化
2. 直播间号和 UID 输入后直接查询；主播名字需搜索；链接自动解析提取房间号
3. 已添加直播间卡片实时更新直播状态
4. →进入 按钮跳转到发送弹幕页面

---

#### 子页面二：账号

**功能：扫码/Cookie 登录、切换账号、隐身模式**

```
┌─────────────────────────────────────────────────────────┐
│  账号                                             + 添加 │
├─────────────────────────────────────────────────────────┤
│  ┌─ 添加账号对话框 ────────────────────────────────────┐ │
│  │  登录方式:  ○ 扫码登录  ○ Cookie 登录               │ │
│  │                                                     │ │
│  │  ──── 扫码登录 ────                                 │ │
│  │       ┌───────────┐                                 │ │
│  │       │ [QR 二维码] │   使用哔哩哔哩手机端扫码登录   │ │
│  │       └───────────┘                                 │ │
│  │       二维码将在 XX 秒后过期  [刷新]                 │ │
│  │                                                     │ │
│  │  ──── Cookie 登录 ────                              │ │
│  │  ┌───────────────────────────────────────────┐      │ │
│  │  │  粘贴 Cookie 字符串...                      │      │ │
│  │  └───────────────────────────────────────────┘      │ │
│  │  提示: F12 → Application → Cookies → 复制全部      │ │
│  │                          [取消]  [登录]             │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  已登录账号                                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 👤 用户A  UID: 123456    🟢 Cookie 有效          │   │
│  │    等级: Lv6  VIP: 年度大会员                      │   │
│  │    [设为发送账号] [设为接收账号] [移除]            │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ 👤 用户B  UID: 789012    🟡 Cookie 即将过期      │   │
│  │    [设为发送账号] [设为接收账号] [移除]            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  当前使用:  发送 → 用户A    接收 → 用户A                │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 👻 隐身模式                                      │   │
│  │ ☑ 使用隐身模式接收弹幕（不使用 Cookie，仅公开弹幕）│   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**交互细节：**

1. **扫码登录**：弹出对话框自动生成 QR → 每 3s 轮询 → 180s 过期 → 成功后自动关闭
2. **Cookie 登录**：粘贴 → 登录 → Rust 后端校验 → 显示用户信息
3. **双账号模式**：发送账号和接收账号可独立切换
4. **隐身模式**：不携带 Cookie 接收弹幕，仅可接收公开弹幕流
5. **Cookie 有效性**：🟢 有效 / 🟡 即将过期(<7天) / 🔴 已过期

---

#### 子页面三：AI 接入

**功能：接入 OpenAI 兼容 API，配置端点/密钥/模型，测试延迟与可用性**

参考 cc-switch 的 ProviderCard + EndpointSpeedTest 模式。

```
┌─────────────────────────────────────────────────────────┐
│  AI 接入                                          + 添加 │
├─────────────────────────────────────────────────────────┤
│  ┌─ 添加/编辑 AI 模型对话框 ──────────────────────────┐ │
│  │  API 端点地址   [https://api.openai.com/v1       ] │ │
│  │  API Key        [sk-••••••••••••••••••••]  👁     │ │
│  │  模型名称       [gpt-4o-mini                    ] │ │
│  │  或从可用模型中选择:  [获取模型列表]                │ │
│  │    ┌───────────────────────────────────────────┐   │ │
│  │    │  gpt-4o-mini  ·  gpt-4o  ·  gpt-3.5-turbo│   │ │
│  │    └───────────────────────────────────────────┘   │ │
│  │  备注 (可选)    [我的 GPT-4o 账号               ] │ │
│  │  [测试连接]  结果: ● 正常 (328ms)                  │ │
│  │                          [取消]  [保存]             │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  已配置的模型                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ⭐ GPT-4o Mini                                   │   │
│  │    端点: api.openai.com  模型: gpt-4o-mini       │   │
│  │    状态: ● 正常 (328ms)                           │   │
│  │    [切换使用] [编辑] [测试] [删除]                 │   │
│  ├─────────────────────────────────────────────────┤   │
│  │    本地 Qwen                                      │   │
│  │    端点: localhost:11434  模型: qwen2.5:7b        │   │
│  │    状态: 🔴 不可用 (连接超时)                     │   │
│  │    [切换使用] [编辑] [测试] [删除]                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  当前使用:  ⭐ GPT-4o Mini (gpt-4o-mini)                │
└─────────────────────────────────────────────────────────┘
```

**交互细节：**

1. 填写端点 + Key + 模型名，或点击 [获取模型列表] 从 `/v1/models` 加载
2. **测试连接**：发送简单请求，测量延迟，颜色：<300ms 🟢 / <800ms 🟡 / >800ms 🟠 / 失败 🔴
3. 当前使用的模型带 ⭐ 标记
4. 初始版本仅支持 OpenAI 兼容 API，不涉及 AI 对话/自动回复

---

#### 子页面四：设置

**功能：应用全局配置项**

```
┌─────────────────────────────────────────────────────────┐
│  设置                                                   │
├─────────────────────────────────────────────────────────┤
│  ──── 弹幕发送 ────                                     │
│  发送间隔  最小 [1.5] 秒    最大 [3.0] 秒               │
│  速率限制  每分钟上限 [20] 条   滑动窗口 [30] 秒         │
│  ☑ 启用随机间隔    ☑ 启用间隔微扰(±0.3s)                │
│  ☑ 禁言自动暂停    ☐ 相同内容自动追加随机后缀            │
│                                                         │
│  ──── 弹幕接收 ────                                     │
│  ☑ 自动连接弹幕流    ☑ 断线自动重连                     │
│  重连间隔 [5] 秒       最大重连间隔 [60] 秒              │
│                                                         │
│  ──── 外观 ────                                         │
│  主题  ○ 浅色  ○ 深色  ○ 跟随系统                       │
│  弹幕字号 [14] px   ☑ 显示粉丝勋章  ☑ 显示等级标识      │
│                                                         │
│  ──── 通知 ────                                         │
│  ☑ 禁言提醒    ☑ Cookie过期提醒                         │
│  ☐ 发送成功提醒   ☐ 醒目留言提醒                        │
│                                                         │
│  ──── 数据 ────                                         │
│  配置路径  C:\Users\...\Roaming\...     [打开]          │
│  [导出配置]  [导入配置]                                  │
│                                                         │
│  ──── 关于 ────                                         │
│  BiliDanmu v0.1.0  |  仅供学习研究  |  [检查更新] [GitHub] [查看日志] │
└─────────────────────────────────────────────────────────┘
```

**配置项清单：**

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| 发送最小间隔 | number | 1.5s | 两次发送之间的最小间隔 |
| 发送最大间隔 | number | 3.0s | 两次发送之间的最大间隔 |
| 每分钟上限 | number | 20 | 滑动窗口内最大发送数 |
| 滑动窗口 | number | 30s | 速率限制的统计窗口 |
| 随机间隔 | bool | true | 在 min-max 间随机选择间隔 |
| 微扰 | bool | true | 间隔 ±0.3s 抖动 |
| 禁言暂停 | bool | true | 检测到禁言自动停止发送 |
| 相同内容后缀 | bool | false | 连续相同消息追加随机字符 |
| 自动连接弹幕流 | bool | true | 进入直播间自动连接 WS |
| 断线重连 | bool | true | 弹幕流断线自动重连 |
| 主题 | enum | 跟随系统 | 浅色/深色/跟随系统 |
| 弹幕字号 | number | 14px | 弹幕流中文字大小 |
| 显示勋章 | bool | true | 是否显示粉丝勋章 |
| 显示等级 | bool | true | 是否显示用户等级 |
| 禁言提醒 | bool | true | 禁言时弹出通知 |
| Cookie过期提醒 | bool | true | Cookie 即将过期时提醒 |

---

### 4.2 发送弹幕页面（使用面板）

**UI 风格参考哔哩哔哩直播姬**，左右双栏布局（35%/65%），参考 simple_live_app 桌面端。

```
┌──────────────────────────────────────────────────────────────────┐
│  ← 返回   主播A的直播间  🔴 LIVE   在线: 1.2万     👤 用户A    │
├────────────────────────────────┬─────────────────────────────────┤
│                                │                                 │
│   直播间信息区                  │   弹幕流区域                    │
│   ┌──────────────────────┐    │   [Medal] 用户A: 哈哈哈         │
│   │ 🖼 主播头像           │    │   [Medal] 用户B: [emote_img]   │
│   │ 主播A                │    │   [Medal] 用户C: 666           │
│   │ UID: 12345678        │    │   💰 用户E 醒目留言 ¥30        │
│   │ 房间号: 12345         │    │   🎁 用户D 送出 小电视x1       │
│   │ 标题: 今晚继续冲！    │    │   用户F 进入了直播间            │
│   │ 分区: > 手游 > 原神  │    │                     [回到底部 ↓]│
│   │ 🔴 直播中  02:34:56  │    │                                 │
│   └──────────────────────┘    │   ┌─────────────────────────┐   │
│                                │   │ 😊 [___输入弹幕___] 发送│   │
│   ┌──────────────────────┐    │   └─────────────────────────┘   │
│   │ 快捷操作              │    │                                 │
│   │ [👍点赞] [🎁礼物]    │    │   ┌─────────────────────────┐   │
│   └──────────────────────┘    │   │ 独轮车  ▲               │   │
│                                │   │ [📝文字] [😊表情] [⭐收藏]│   │
│   ┌──────────────────────┐    │   │ ...                     │   │
│   │ 发送统计              │    │   └─────────────────────────┘   │
│   │ 已发送: 42  禁言: 正常│    │                                 │
│   └──────────────────────┘    │                                 │
│                                │                                 │
│        宽度 ~35%               │        宽度 ~65%                │
└────────────────────────────────┴─────────────────────────────────┘
```

**弹幕输入栏：**
- 单行输入，Enter 发送，最多 20 字（B站限制），右下角 "12/20" 字数计数
- 😊 表情按钮 → 弹出表情选择面板
- 发送按钮在输入为空时 disabled，发送中显示 Spinner
- 禁言时输入框变红 + 显示禁言倒计时

**表情选择器（参考 PiliPlus + BLSPAM）：**
- 上方表情网格，hover 显示名称 tooltip
- 下方表情包 Tab（封面图标），点击切换
- 房间表情 / 通用表情 分类
- 点击文字表情插入到输入框；点击大表情直接发送（dm_type=1）
- 不可用表情灰显

**弹幕流渲染规则：**

| 消息类型 | 渲染方式 | 样式 |
|---------|---------|------|
| 普通弹幕 | `[勋章] 用户名: 消息文本` | 白色文字 |
| 含文字表情弹幕 | `[emote_key]` 替换为 inline `<img>` 24px | 混排 |
| 大表情弹幕 | 仅表情图片 36px | 居中 |
| 醒目留言 (SC) | 独立卡片，黄色/粉色背景 | 特殊卡片 |
| 礼物消息 | `🎁 用户 送出 礼物名 x数量` | 金色 |
| 进场消息 | `用户 进入了直播间` | 灰色小字 |

**表情解析（核心）：** 弹幕 JSON 的 `info[0][15][extra][emots]` 包含表情 URL 映射，正则替换文本为 `<img>` 标签。

**独轮车面板（参考 BLSPAM）：**

三个 Tab：

| Tab | 控件 |
|-----|------|
| 📝 文字 | 时间间隔、时间限制、发送内容(Textarea 每行一条)、开车/停车 |
| 😊 表情 | 已选表情、表情网格(Checkbox)、时间间隔、开车/停车 |
| ⭐ 收藏 | 收藏标签(Tabs 可增删)、消息内容、发送到文字Tab、开车/停车 |

通用逻辑：开车后按间隔循环发送，失败3次自动停车，禁言自动停车+通知。

---

### 4.3 系统托盘页面

**图标状态：**

| 应用状态 | 图标 | Tooltip |
|---------|------|---------|
| 未连接直播间 | 灰色 | BiliDanmu - 未连接 |
| 已连接弹幕流 | 蓝色 | BiliDanmu - 直播间名 |
| 独轮车运行中 | 绿色 | BiliDanmu - 独轮车运行中 |
| 禁言状态 | 红色 | BiliDanmu - 已禁言 (剩余Xm) |

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
  sendAccountId: string | null;   // 当前发送账号
  recvAccountId: string | null;   // 当前接收账号
  stealthMode: boolean;           // 隐身模式
}

// room-store.ts
interface RoomState {
  rooms: Room[];
  currentRoomId: string | null;
  roomStatus: Record<string, { isLive: boolean; online: number; title: string }>;
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
  riskControl: { randomInterval: boolean; jitter: boolean; autoPauseOnMute: boolean; appendRandomSuffix: boolean };
  receive: { autoConnect: boolean; autoReconnect: boolean; reconnectInterval: number; maxReconnectInterval: number };
  appearance: { theme: 'light' | 'dark' | 'system'; fontSize: number; showMedal: boolean; showLevel: boolean };
  notification: { muteAlert: boolean; cookieExpiry: boolean; sendSuccess: boolean; scAlert: boolean };
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
    loginByQr: () => invoke<{ url: string; qrcode_key: string }>('login_by_qr'),
    pollQr: (qrcodeKey: string) => invoke<Credential>('poll_qr', { qrcodeKey }),
    loginByCookie: (cookie: string) => invoke<Credential>('login_by_cookie', { cookie }),
    checkLoginStatus: () => invoke<LoginStatus>('check_login_status'),
  },
  danmaku: {
    send: (roomId: number, msg: string, opts?: SendOptions) => invoke<BiliResponse>('send_danmaku', { roomId, msg, ...opts }),
    sendEmoticon: (roomId: number, emoticonUnique: string) => invoke<BiliResponse>('send_emoticon', { roomId, emoticonUnique }),
    startLoop: (roomId: number, messages: string[], intervalMs: number) => invoke<void>('start_loop_send', { roomId, messages, intervalMs }),
    stopLoop: () => invoke<void>('stop_loop_send'),
  },
  room: { getInfo: (roomId: number) => invoke<RoomInfo>('get_room_info', { roomId }), getEmoticons: (roomId: number) => invoke<EmoticonPackage[]>('get_emoticons', { roomId }) },
  ws: { connect: (roomId: number) => invoke<void>('connect_danmaku_stream', { roomId }), disconnect: () => invoke<void>('disconnect_danmaku_stream') },
  ai: { addModel: (m: AIModelInput) => invoke<AIModel>('add_ai_model', m), testConnection: (m: AIModelInput) => invoke<TestResult>('test_ai_connection', m), fetchModels: (endpoint: string, apiKey: string) => invoke<string[]>('fetch_models', { endpoint, apiKey }), setCurrentModel: (id: string) => invoke<void>('set_current_model', { id }) },
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

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `login_by_qr` | - | `{ url, qrcode_key }` | 生成二维码登录 URL |
| `poll_qr` | `qrcode_key` | `Credential` | 轮询扫码结果 |
| `login_by_cookie` | `cookie` | `Credential` | Cookie 登录 |
| `check_login_status` | - | `LoginStatus` | 检查登录状态 |
| `remove_account` | `account_id` | void | 移除账号 |
| `search_room` | `query, mode` | `RoomSearchResult[]` | 搜索直播间 |
| `add_room` | `room_id` | `RoomInfo` | 添加直播间 |
| `remove_room` | `room_id` | void | 移除直播间 |
| `get_room_info` | `room_id` | `RoomInfo` | 直播间详情 |
| `send_danmaku` | `room_id, msg, color?, mode?` | `BiliResponse` | 发送文字弹幕 |
| `send_emoticon` | `room_id, emoticon_unique` | `BiliResponse` | 发送表情弹幕 |
| `start_loop_send` | `room_id, messages[], interval_ms` | void | 开始循环发送 |
| `stop_loop_send` | - | void | 停止循环发送 |
| `get_emoticons` | `room_id` | `EmoticonPackage[]` | 获取表情列表 |
| `connect_danmaku_stream` | `room_id` | void | 连接弹幕流 |
| `disconnect_danmaku_stream` | - | void | 断开弹幕流 |
| `add_ai_model` | `endpoint, api_key, model_name, notes?` | `AIModel` | 添加模型 |
| `test_ai_connection` | `endpoint, api_key, model_name` | `{ success, latency_ms }` | 测试连接 |
| `fetch_models` | `endpoint, api_key` | `string[]` | 获取可用模型 |
| `set_current_model` | `model_id` | void | 切换当前模型 |
| `get_settings` | - | `Settings` | 获取设置 |
| `update_settings` | `Settings` | void | 更新设置 |
| `export_config` | - | `string` | 导出配置 |
| `import_config` | `json` | void | 导入配置 |

### 事件（Rust → 前端）

| 事件名 | Payload | 说明 |
|--------|---------|------|
| `danmaku-received` | `DanmakuMessage` | 收到弹幕 |
| `gift-received` | `GiftMessage` | 收到礼物 |
| `sc-received` | `SuperChatMessage` | 收到醒目留言 |
| `danmaku-sent` | `{ msg, success }` | 弹幕发送结果 |
| `danmaku-muted` | `{ remain_sec }` | 被禁言 |
| `danmaku-error` | `{ code, message }` | 弹幕流错误 |
| `ws-connected` | `{ room_id }` | 弹幕流已连接 |
| `ws-disconnected` | `{ reason }` | 弹幕流断开 |

---

## 八、下一步详细行动清单

### Phase 1：项目骨架 & Tauri 环境（Day 1-2）

- [ ] **1.1** 初始化 Tauri 2 + React 项目
  - [ ] `bun create tauri-app`（React + TypeScript 模板）
  - [ ] 安装依赖：react-router, zustand, @tanstack/react-query, @tauri-apps/api, @tauri-apps/plugin-store
  - [ ] 初始化 shadcn/ui（`bunx shadcn@latest init`）
  - [ ] 配置 TailwindCSS 4 + postcss
  - [ ] 配置 `tauri.conf.json`（960×680，最小 800×600，标题 BiliDanmu）
  - [ ] 验证 `bun tauri dev` 可启动

- [ ] **1.2** 配置 Rust 依赖
  - [ ] Cargo.toml：reqwest, tokio-tungstenite, brotli, flate2, md-5, serde_json, rand, url, tauri-plugin-store, tauri-plugin-shell, tauri-plugin-log
  - [ ] 配置 `capabilities/default.json`

- [ ] **1.3** 搭建前端骨架
  - [ ] React Router 路由（/rooms, /accounts, /ai, /settings, /room/:roomId）
  - [ ] Zustand stores 创建（5 个 store）
  - [ ] TanStack QueryProvider
  - [ ] AppLayout（64px 侧边栏 + 内容区）
  - [ ] shadcn/ui 基础组件（button, input, dialog, select, toast, card）

### Phase 2：Rust 后端 — 认证 & WBI 签名（Day 3-4）

- [ ] **2.1** `bili/credential.rs` — Credential 结构体、Cookie 解析、校验、持久化
- [ ] **2.2** `bili/wbi.rs` — 混淆表、sign_wbi、密钥获取与缓存（12h TTL）
- [ ] **2.3** `bili/buvid.rs` — buvid3/4 生成
- [ ] **2.4** `commands/auth.rs` — login_by_qr, login_by_cookie, check_login_status

### Phase 3：Rust 后端 — 弹幕发送 & API（Day 5-7）

- [ ] **3.1** `bili/api.rs` — send_danmaku, send_emoticon, get_room_info, get_danmu_info, get_emoticons, get_user_info
- [ ] **3.2** `bili/rate_limiter.rs` — 随机间隔、滑动窗口、禁言检测
- [ ] **3.3** `commands/danmaku.rs` — send_danmaku, send_emoticon, start_loop_send, stop_loop_send
- [ ] **3.4** `commands/room.rs` — get_room_info, get_emoticons

### Phase 4：Rust 后端 — WebSocket 弹幕接收（Day 8-10）

- [ ] **4.1** `bili/protocol.rs` — PacketHeader、auth/heartbeat 构造、Brotli/zlib 解压
- [ ] **4.2** `bili/ws_client.rs` — 连接、认证、心跳、事件推送、自动重连
- [ ] **4.3** `commands/websocket.rs` — connect/disconnect、事件：danmaku-received, danmaku-error, ws-connected

### Phase 5：前端页面开发（Day 11-14）

- [ ] **5.1** 子页面一：RoomPage（添加/切换直播间）
- [ ] **5.2** 子页面二：AccountPage（扫码/Cookie 登录、账号切换、隐身模式）
- [ ] **5.3** 子页面三：AIPage（模型配置、延迟测试）
- [ ] **5.4** 子页面四：SettingsPage（速率/外观/通知/关于）
- [ ] **5.5** 发送弹幕页面：DanmakuPage（弹幕流、输入栏、表情选择器、独轮车面板）

### Phase 6：完善 & 打包发布（Day 15-18）

- [ ] **6.1** 系统托盘（tray.rs，参考 cc-switch）
- [ ] **6.2** 测试（Rust 单元测试 + 前端组件测试 + 手动集成测试）
- [ ] **6.3** 风控对抗（UA 轮换、随机间隔、内容微变化、禁言检测）
- [ ] **6.4** 打包（`bun tauri build` → NSIS 安装包，GitHub Release CI/CD）

---

## 九、依赖清单

### 前端 (package.json)

```json
{
  "dependencies": {
    "react": "^18.3", "react-dom": "^18.3", "react-router": "^7.0",
    "@tauri-apps/api": "^2.0", "@tauri-apps/plugin-store": "^2.0",
    "zustand": "^5.0", "@tanstack/react-query": "^5.60",
    "clsx": "^2.1", "tailwind-merge": "^2.6", "class-variance-authority": "^0.7",
    "lucide-react": "^0.460",
    "@radix-ui/react-dialog": "^1.1", "@radix-ui/react-select": "^2.1",
    "@radix-ui/react-toast": "^1.2", "@radix-ui/react-slot": "^1.1"
  },
  "devDependencies": {
    "typescript": "^5.6", "vite": "^6.0", "@vitejs/plugin-react": "^4.3",
    "tailwindcss": "^4.0", "@tauri-apps/cli": "^2.0",
    "vitest": "^2.0", "@testing-library/react": "^16.0", "jsdom": "^25.0"
  }
}
```

### 后端 (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-store = "2"
tauri-plugin-shell = "2"
tauri-plugin-log = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["rustls-tls", "cookies"] }
tokio-tungstenite = { version = "0.24", features = ["rustls-tls-native-roots"] }
brotli = "7"
flate2 = "1"
md-5 = "0.10"
rand = "0.8"
url = "2"
chrono = "0.4"
log = "0.4"
```

---

## 十、风险与注意事项

1. **风控风险**：B站对弹幕发送有严格限制，发送过快会被禁言。必须实现速率限制，建议默认 2 秒间隔
2. **Cookie 过期**：SESSDATA 有效期约 30 天，需要提醒用户定期更新
3. **API 变动**：B站接口可能随时变动，需要关注 bilibili-API-collect 的更新
4. **WBI 签名**：混淆表可能更新，需要从 API 动态获取并缓存
5. **WebView2**：Tauri 2 在 Windows 上依赖 WebView2 运行时（Win10 1903+ 内置，Win7 需额外安装）
6. **合规性**：本项目仅供学习研究，滥用发送功能可能违反B站用户协议
