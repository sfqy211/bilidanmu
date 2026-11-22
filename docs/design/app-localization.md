# BiliDanmu 界面语言系统开发文档

首发语言为简体中文（`zh-CN`）和 English（`en`）。入口位于「设置 → 通用 → 界面语言」，两项始终用各自的语言名称显示。默认使用简体中文，语言包随安装包分发。切换成功后，主窗口、直播弹幕窗、视频弹幕窗和系统托盘在当前进程内更新。用户可以继续当前页面、直播连接或视频播放。

| 批次 | 交付 | 验收条件 |
| --- | --- | --- |
| 第一批 | 语言设置和保存、三种窗口与托盘同步、首批双语词条 | 开发版可以完成中文 → 英文 → 中文的切换，覆盖旧库、重启和保存失败 |
| 第二批 | 补齐桌面端文案、共享弹幕组件和完整回归，向正式版开放入口 | 普通用户能在安装版以英文完成主要流程，覆盖面内的应用文案均有英文词条 |
| 后续 | 跟随系统、增加语言、文档站本地化 | 各项按需独立交付，兼容已有语言选择 |

## 第一批 建立语言设置和跨窗口更新

### 1. 写入 SQLite 并定义 IPC

当前多个窗口会保存整份 `Settings`，`settings-changed` 也会在落盘前广播。给语言单独的写入入口，避免延迟到达的外观、STT 或 MCP 设置快照把已保存的语言覆盖回去。

| 接口 | 数据与行为 |
| --- | --- |
| `Settings.locale` | TS 类型为 `"zh-CN" \| "en"`，Rust 使用对应的 `Locale` 类型。保存在 `app_metadata` 的 `settings` JSON 里。旧记录缺失字段、值为 `null` 或为未知语言标识时，仅该字段回退到 `zh-CN` |
| `get_settings` | 返回已保存并规范化的设置。启动和语言变更后以返回的 `locale` 初始化或刷新界面 |
| `set_locale` | 接收 `{ locale: "zh-CN" \| "en" }`，返回已保存的语言。未知入参返回 `INVALID_LOCALE`，写入失败返回 `LOCALE_SAVE_FAILED`，错误细节写入日志。重复设置同一值可直接返回成功 |
| `locale-changed` | Rust 在语言变更持久化成功后全局广播，载荷为 `null`。各窗口收到通知后重新读取 `get_settings` |

- 在 [Rust 设置模型](../../src-tauri/src/models/settings.rs)、[TS 设置类型](../../src/types/bilibili.ts)和 [Zustand 默认设置](../../src/stores/settings-store.ts)补齐默认值和类型。Rust 对数据库反序列化采用字段级宽容处理，对命令入参采用严格校验。
- 在 [settings_store.rs](../../src-tauri/src/settings_store.rs)复用接收 SQLite 连接的读写逻辑。`set_locale` 在同一次 `with_connection` 调用中读取设置 JSON、只修改 `locale` 并写入。没有记录时以 `Settings::default()` 为初值。现有 `save_settings` 在同一把连接锁内取出已保存语言，再写入其他字段。两种写法都通过该存储层，锁释放后再广播和刷新原生 UI。
- 在 [Rust 设置命令](../../src-tauri/src/commands/settings.rs)实现 `set_locale`，在 [命令注册](../../src-tauri/src/lib.rs)和 [TS IPC 封装](../../src/lib/tauri.ts)接入，并同步 [IPC 命令文档](../docs/api/ipc.md)和 [事件文档](../docs/api/events.md)。

### 2. 初始化词条和切换入口

- 根前端新增 `i18next`、`react-i18next` 和相应锁文件变更。建议目录为 `src/i18n/`，包含初始化入口、语言类型与 `locales/zh-CN/`、`locales/en/`。首批内置 `common`、`settings`、`danmaku` 三组资源，缺词条时由 `zh-CN` 提供回退。
- 在 [main.tsx](../../src/main.tsx)的公共启动流程中，每个 WebView 先订阅 `locale-changed`，再读取初始设置并初始化语言，最后挂载 React。切换时沿用同一个 i18next 实例，调用 `changeLanguage` 并同步 `document.documentElement.lang`。初始读取、事件刷新和保存后的刷新走同一条路径，用递增序号丢弃过期响应。读库失败时，首帧使用中文，运行中保留当前语言，下次窗口获得焦点时重试。
- 在 [GeneralSettings](../../src/components/settings/GeneralSettings.tsx)使用现有 `SettingsChoice`。选择后立即调用 `tauriCommands.settings.setLocale`，保存期间禁用该控件。成功时刷新当前已保存语言，失败时保留旧选项并显示当前语言的错误提示。`locale` 独立于 [SettingsPage](../../src/pages/SettingsPage.tsx) 的自动保存变更检测和通用页重置。`App.tsx` 现有的 `settings-changed` 继续负责其他设置。
- 翻译键按用途命名，例如 `settings.general.language`、`danmaku.connection.reconnecting`。静态配置存词条键，在渲染时取值，避免模块初始化时把语言固定下来。第一批把入口放在开发版，例如用 `import.meta.env.DEV` 控制可见性。第二批验收后移除入口限制。[React 翻译与切换](https://react.i18next.com/latest/usetranslation-hook) · [i18next 语言回退](https://www.i18next.com/principles/fallback)

### 3. 接入三种窗口和原生托盘

| 区域 | 首批改动 |
| --- | --- |
| 主窗口 | [AppSidebar](../../src/components/layout/AppSidebar.tsx)、[WorkspaceSidebar](../../src/components/layout/WorkspaceSidebar.tsx)、[TitleBar](../../src/components/layout/TitleBar.tsx)及设置分类的标签、提示和无障碍名称 |
| 弹幕窗口 | [DanmakuWindow](../../src/components/danmaku/DanmakuWindow.tsx) 的共享标题栏、[DanmakuDefaultPage](../../src/pages/DanmakuDefaultPage.tsx) 的启动引导、[DanmakuPage](../../src/pages/DanmakuPage.tsx) 和 [VideoDanmakuPage](../../src/pages/VideoDanmakuPage.tsx) 的通用空状态及退出按钮 |
| 托盘与系统窗口标题 | Rust 新增 `locale.rs`，集中管理托盘菜单、空状态和系统标题中由应用生成的文字。修改 [tray.rs](../../src-tauri/src/tray.rs)、[room.rs](../../src-tauri/src/commands/room.rs) 和 [video_window.rs](../../src-tauri/src/commands/video_window.rs)。托盘创建和后续重建均读取已保存语言，房间与视频标题仍使用实际内容，空标题和房间号标题采用本地化模板 |

`set_locale` 保存后通知 WebView，并尝试刷新托盘及已存在窗口的系统标题。原生刷新在执行时取当前已保存的语言，避免迟到的任务把标题改回旧语言。刷新失败时记录日志，语言保存结果仍返回成功，并在后续菜单重建或窗口唤起时按已保存语言恢复。更新时复用现有菜单 ID、窗口标签和播放实例，避免将语言用作 React 根组件的 `key`。

### 第一批验收

| 操作 | 预期结果 |
| --- | --- |
| 用缺少 `locale`、值为 `null` 或未知字符串的设置库启动 | 使用中文，其他设置正常读取 |
| 选 English 后立即切到其他页面，随后完全退出并重新启动 | 下次启动首帧为英文。静默启动时托盘菜单也是英文 |
| 已打开或隐藏弹幕窗时切换语言 | 窗口唤起后文字一致。浏览器夹具模拟已挂载的主、直播和视频界面接收 `locale-changed`，验证无需重新挂载 |
| 切换语言后保存一份旧的普通设置快照，并触发一次托盘重建 | 普通设置可以更新，语言和托盘仍使用最新值 |
| 在 IPC 夹具中模拟落盘失败 | 选择器显示当前语言的错误，设置、已打开窗口和托盘保持此前选择 |
| 英文与中文各测一次窗口交互 | 侧栏收起、托盘唤起、直播切房、视频播放和弹幕窗退出按现有流程工作。按钮提示和 `html[lang]` 与语言一致 |

## 第二批 补齐桌面端文案并发布

### 1. 按用户流程迁移文案

| 流程 | 迁移内容 |
| --- | --- |
| 直播与互动 | 房间列表、添加直播间、连接状态、开播与下播、活动栏、切房、输入框、表情、屏蔽、自动发送和自动点赞。礼物发送入口按 `gift-send` 功能开关回归 |
| 视频与字幕 | 添加视频、稍后再看、收藏夹、评论、播放队列、播放器、视频弹幕窗，以及 CC、STT 的按钮、进度和错误提示 |
| 账号、AI 和设置 | 登录、切换账号、关闭确认、更新提示、设置页全部分类、STT 模型管理、AI 权限标签和确认弹窗 |
| 通用组件与原生 UI | 按钮、提示、搜索占位符、键盘提示、空状态、无障碍名称、Toast，以及 Rust 创建的用户可见菜单和系统标题 |

- 用稳定的事件类型生成界面文案。例如 [ws_client.rs](../../src-tauri/src/bili/ws_client.rs) 的开播和下播事件可按 `live`、`preparing` 映射到词条，保留现有事件载荷供外部消费者读取。主播名、弹幕正文、房间与视频标题、评论、字幕和 STT 识别结果直接用原始内容。
- 处理用户可采取行动的错误时，用稳定错误码映射应用文案。例如登录过期、发送频率过高、字幕加载失败。复用已有错误码，新增结构化字段时维持现有消费者的兼容性。通用错误可显示本地化摘要，详细的第三方返回与日志保留原文。MCP 工具名、参数、权限枚举和协议事件名沿用现有接口。
- 日期、数值和时长分别按用途处理。日期和普通数字使用 `Intl` 与已解析语言。复数使用 `count` 和目标语言规则。视频时间轴继续用便于定位的 `mm:ss` 或 `hh:mm:ss`。金额使用业务币种，按语言格式化显示。固定 B 站术语，例如中文「弹幕」对应英文 `Danmaku`、「醒目留言」对应 `Super Chat`。[i18next 复数规则](https://www.i18next.com/translation-function/plurals)

### 2. 适配共享 `danmaku-core` UI

1. 在同级仓库 `../danmaku-core/packages/ui/src/DanmakuMessageItem.tsx` 为组件自身生成的菜单项、提示和无障碍名称提供可选文案参数。对含等级数字等内容的词条使用格式化回调。缺省值采用现有中文，且公共组件只依赖传入的数据和文案。
2. 在 [应用侧 DanmakuMessageItem](../../src/components/danmaku/DanmakuMessageItem.tsx) 组装当前语言的标签与回调，并传给共享组件。顺手验证 memo 或虚拟列表中的已存在条目也会更新语言。
3. 先在共享仓库跑 `npm test`，确认未传入文案的消费方与传入英文的消费方都能工作。共享改动可被客户端 CI 拉取后，更新客户端 `src-tauri/Cargo.toml` 的共享 Git revision 及 `src-tauri/Cargo.lock`。核对 `node scripts/shared-core-revision.mjs` 输出对应 SHA，再跑客户端与文档站构建。

### 第二批验收与发布

- 客户端在开发版提供 English。共享弹幕组件的双语参数需要进入客户端固定的 `danmaku-core` 修订后，干净检出的构建才能包含这部分文案。更新修订后还需完成原生托盘与三平台冒烟，再打开正式版入口。
- 新增词条检查，可放在 `tests/check-locales.mjs` 并接入 CI。以中文基准检查英文业务键和插值参数，按目标语言规则校验复数形式，另检查 Rust 托盘这类原生固定文案是否同时覆盖两种语言。运行时保留中文回退，正式发布以核心流程不存在缺失英文词条为准。
- 使用虚拟直播间验证开播、下播和断线重连。用带中文昵称及正文的测试消息验证切语言后原始内容仍可读取。用视频夹具覆盖切换期间的播放进度、队列和焦点。分别检查直播窗 48px 紧凑栏、弹幕窗吸附收起和图标栏，以及主窗口最小尺寸下的设置页。
- 在 Windows、macOS、Linux 的原生构建做语言、托盘和重启冒烟检查。通过后在正式构建显示入口，同步更新用户指南。若把多语言列为正式功能，同步修改 README、功能指南和网站首页功能清单。

## 后续扩展

| 内容 | 开发步骤 | 验收 |
| --- | --- | --- |
| 跟随系统 | 增加显式 `system` 选项。Rust 统一解析 OS locale，并把解析结果供 WebView 和托盘使用。先支持启动时匹配，运行中监听系统变化可独立交付 | `en-US`、`en-GB` 解析到 `en`，未支持的系统语言回退到 `zh-CN`。已保存的显式中英文选择继续生效 |
| 新增语言 | 同步登记语言标识、自称、Rust 原生词条与应用词条。先做术语表，再跑插值、复数和界面宽度检查。若以后支持从右向左书写的语言，同时处理文档方向和窗口控件布局 | 新词条检查通过，设置可以切回任一已发布语言，最小尺寸下可操作 |
| 文档站本地化 | 从 [Docusaurus 配置](../docusaurus.config.ts) 的 `zh-Hans` 扩展英文独立路径，优先翻译下载页、入门和关键操作指南，随后补 API 参考 | 两种语言构建通过，文档语言入口、下载链接和主要内部链接有效 |

## 执行检查

先读 [测试手册](../../tests/README.md)，确认同级 `danmaku-core` 的 HEAD 与 `node scripts/shared-core-revision.mjs` 一致。两批实现都从客户端仓库根目录执行以下检查。

```powershell
npm run typecheck
npm --prefix docs run build
Push-Location src-tauri
cargo check
Pop-Location
```

窗口回归在一个终端运行 `npm run dev:renderer`，再从另一个终端运行 `./tests/test-video-window.ps1`。原生托盘和 SQLite 持久化用隔离测试配置或独立系统账户运行 `npm run dev:mock`。手动用以下命令切换虚拟直播间状态和触发重连，观察英文与中文下的事件文案、连接恢复和托盘房间项。

```powershell
curl.exe -X POST http://127.0.0.1:23331/live
curl.exe -X POST http://127.0.0.1:23331/preparing
curl.exe -X POST http://127.0.0.1:23331/kick
```

共享 UI 有变更时运行 `npm --prefix ../danmaku-core test`。涉及共享协议或 Rust 模型时运行 `cargo test --manifest-path ../danmaku-core/Cargo.toml --workspace --locked`。需要跑客户端 mock 端到端测试时，先关闭 `dev:mock` 释放端口，再从 `src-tauri/` 运行 `cargo test --lib bili::mock`。
