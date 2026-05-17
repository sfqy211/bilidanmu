# 进度与路线图

> 项目当前进度、各阶段行动清单、未完成项、风险与注意事项。

---

## 一、进度总览

| 阶段                           | 状态      | 说明                                                                           |
| ------------------------------ | --------- | ------------------------------------------------------------------------------ |
| Phase 1：项目骨架 & Tauri 环境 | ✅ 已完成 | 前后端骨架搭建完成，路由 / layout / Zustand stores / Tauri 命令注册已齐全      |
| Phase 2：认证 & WBI 签名       | ✅ 已完成 | `credential.rs` / `wbi.rs` / `buvid.rs` / `credential_store.rs` 已接通         |
| Phase 3：弹幕发送 & API        | ✅ 已完成 | 文字/表情弹幕发送、表情列表获取、房间搜索、房间信息、循环发送后端均为真实调用  |
| Phase 4：WebSocket 弹幕接收    | ✅ 已完成 | `protocol.rs` 协议解析、`ws_client.rs` 连接/认证/心跳/重连、前端事件监听已接通 |
| Phase 5：前端页面开发          | ✅ 已完成 | RoomPage、DanmakuPage、AccountPage、SettingsPage、AIPage 全部进入可用态        |
| Phase 6：完善 & 打包           | 🔧 进行中 | 系统托盘、图片代理、SQLite 迁移、CI/CD、多账号支持、v2 API、音频流播放已完成   |

### 当前已实现情况（按代码现状）

**已完成 / 可用：**

- Tauri 2 + React 18 + TypeScript 项目骨架（v0.2.0）
- 主布局、侧边栏导航、基础路由
- Cookie 登录、二维码登录、启动恢复登录、登出
- WBI 签名与缓存
- 房间搜索（名称 / 房间号 / 链接 / UID）
- 房间添加、移除、本地持久化（SQLite）
- 文字弹幕发送、表情弹幕发送命令
- 表情列表获取（get_emoticons API + 前端表情选择器）
- 自动发送后端（start_auto_send / stop_auto_send，支持文字/表情统一 AutoSendEntry + 时间限制 + oneshot 控制 + 事件通知）
- buvid3/4 真实生成（随机 hex + 时间戳，自动补充到 Cookie 缺失字段）
- WebSocket 弹幕接收、心跳、断线重连
- DanmakuPage 实时弹幕流、时间戳、人气值、自动滚动、回到底部、Enter 发送、表情选择器
- 接收增强：礼物消息、进场消息、SC 消息、inline 表情渲染、大表情渲染
- 自动发送完整版（useAutoSend + AutoSendPanel 三 Tab：文字/表情/收藏夹，统一 start/stop，收藏夹→文字填充）
- AccountPage 真实 UI（扫码登录 + Cookie 登录、本地 QR 生成、过期自动刷新、账号展示、发送/接收标记、退出登录、隐身模式开关）
- SettingsPage 真实读写（settings_store.rs 持久化 + IPC 命令 + 前端表单）
- AIPage 最小真实版（ai_store.rs 持久化 + IPC 命令：保存/加载/测试连接/获取模型列表/切换当前/编辑/删除）
- 系统托盘动态菜单（账号/房间/AI 状态实时展示，状态变化自动刷新）
- DanmakuPage 组件化拆分：SuperChatCard、DanmakuMessageItem、InlineEmotText、EmoticonPickerPanel、AutoSendPanel
- 图片代理系统：`proxy_image` 命令 + `useProxyImage` hook + `ProxiedImage` 组件
- SQLite 持久化迁移：`db.rs` 初始化 + room/ai/emoticon/selections 均使用 SQLite
- Selections 恢复机制：批量读写 + 前端启动时恢复并校验
- 表情包 key 修复：`makePkgKey(pkgId-pkgType)` 复合 key
- 主题切换（useTheme hook + dark class toggle）
- 音频流拉取与播放：v2 API `getRoomPlayInfo` + WBI 签名 + 本地 hyper 代理（绕过 CORS）+ mpegts.js（FLV→fMP4→MSE）+ 自动重连
- STT 实时语音转文字：sherpa-onnx 流式识别 + symphonia 0.6 AAC 解码 + FLV 解复用 + 本地代理字节流 tee
- 字幕叠加层：SubtitleOverlay 组件 + useSttTranscript 延迟缓冲 + 按需 RAF 循环
- STT 设置面板：SettingsPage 语音识别标签（开关/模型/延迟滑块）
- 代码审查修复 15 项（stop 挂起、DC 偏置、路径穿越、FLV 内存暴涨、通道不一致等）
- 日志过滤：tauri_plugin_log 配置 Info 级别 + 仅 Stdout target

---

## 二、行动清单

### Phase 1：项目骨架 & Tauri 环境（Day 1-2） ✅ 已完成

- [x] **1.1** 初始化 Tauri 2 + React 项目
- [x] **1.2** 配置 Rust 依赖
- [x] **1.3** 搭建前端骨架

### Phase 2：Rust 后端 — 认证 & WBI 签名（Day 3-4） ✅ 已完成

- [x] **2.1** `bili/credential.rs` — Credential 结构体、Cookie 解析、校验、持久化
- [x] **2.2** `bili/wbi.rs` — 混淆表、sign_wbi、密钥动态获取与缓存
- [x] **2.3** `bili/buvid.rs` — buvid3/4 真实生成
- [x] **2.4** `commands/auth.rs` — 认证命令已接入真实 API

### Phase 3：Rust 后端 — 弹幕发送 & API（Day 5-7） ✅ 已完成

- [x] **3.1** `bili/api.rs` — 真实 HTTP 请求层
- [x] **3.2** `bili/rate_limiter.rs` — 已删除（个人使用场景不需要）
- [x] **3.3** `commands/danmaku.rs` — send_danmaku, send_emoticon 命令已接入
- [x] **3.4** `commands/room.rs` — 搜索与房间信息已接入真实 API

### Phase 4：Rust 后端 — WebSocket 弹幕接收（Day 8-10） ✅ 已完成

- [x] **4.1** `bili/protocol.rs` — 二进制协议实现
- [x] **4.2** `bili/ws_client.rs` — WebSocket 客户端
- [x] **4.3** `commands/websocket.rs` — connect/disconnect、事件

### Phase 5：前端页面开发（Day 11-14） ✅ 已完成

- [x] **5.1** 子页面一：RoomPage
- [x] **5.2** 子页面二：AccountPage
- [x] **5.3** 子页面三：AIPage
- [x] **5.4** 子页面四：SettingsPage
- [x] **5.5** 发送弹幕页面：DanmakuPage（组件化拆分 + 基础实时弹幕页）

### Phase 6：完善 & 打包发布（Day 15-18） 🔧 进行中

- [x] **6.1** 系统托盘（tray.rs）
- [x] **6.2** 打包发布（GitHub Actions CI/CD）
- [x] **6.3** 账号移除命令（remove_account）
- [x] **6.4** 升级直播流 API 至 v2（`getRoomPlayInfo`，WBI 签名，FLV 协议）
- [x] **6.5** 仅音频流拉取与播放（v2 API `only_audio=1` + 本地流代理 + mpegts.js 播放）
- [x] **6.6** STT 实时语音转文字管道（sherpa-onnx + symphonia 0.6 + FLV 解复用）
- [x] **6.7** 字幕叠加与 STT 设置 UI
- [x] **6.8** 代码审查修复与日志过滤

---

## 三、未完成项

### 必做

| #   | 项目                 | 说明                                                              |
| --- | -------------------- | ----------------------------------------------------------------- |
| 6.4 | 升级直播流 API 至 v2 | ✅ 已完成 — `getRoomPlayInfo` + WBI 签名 + FLV 协议               |
| 6.5 | 仅音频流拉取与播放   | ✅ 已完成 — `only_audio=1` + 本地 hyper 代理 + mpegts.js MSE 播放 |

### 可选扩展

| 功能               | 说明                                                         |
| ------------------ | ------------------------------------------------------------ |
| 表情自动发送 Tab   | ✅ 已实现，EmotionTab 支持表情选择 + ProxiedImage + 已选预览 |
| 收藏夹自动发送 Tab | ✅ 已实现，FavoritesTab 支持多弹幕组 + 时间限制 + 发送到文字 |
| 仅音频流拉取与播放 | ✅ 已实现，v2 API + 本地代理 + mpegts.js MSE 播放            |

### 可选增强

| 功能                     | 说明                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Cookie 有效期提醒        | AccountPage 展示了账号信息但未做过期倒计时                                            |
| 禁言检测与自动停车       | 设置中有 `autoPauseOnMute` 选项但前端未接入禁言事件                                   |
| 弹幕流左栏               | DanmakuPage 仅实现了右栏弹幕流 + 底部输入栏，左栏直播间信息区/快捷操作/发送统计未实现 |
| 实时直播音频流播放 + STT | ✅ 已实现 — v2 API + 本地代理 + mpegts.js + sherpa-onnx 流式识别                      |

---

## 四、风险与注意事项

1. **Cookie 过期**：SESSDATA 有效期有限，需要提醒用户定期更新
2. **API 变动**：B站接口可能随时变动，需要关注 bilibili-API-collect 的更新
3. **WBI 签名**：混淆表可能更新，需要从 API 动态获取并缓存
4. **buvid 格式兼容**：当前 buvid 生成基于随机 hex + 时间戳，若 Bilibili 更新格式校验规则需跟进
5. **WebView2**：Tauri 2 在 Windows 上依赖 WebView2 运行时（Win10 1903+ 内置，Win7 需额外安装）
6. **合规性**：本项目仅供个人学习与自用，仍应避免滥用发送能力
