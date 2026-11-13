# BiliDanmu

Windows / macOS / Linux 桌面端 B 站直播间弹幕客户端，基于 Tauri 2 + React 18 构建。

## 功能

### 看直播

- 多账号管理（TV 二维码登录 / 切换 / 移除 / 续期 Cookie），启动自动恢复，支持匿名模式
- 单独选择发送账号（主账号负责观看与音频，发送账号负责弹幕与表情）
- 房间搜索（主播名 / 房间号 / 链接 / UID），从关注列表添加正在直播的主播，本地 SQLite 持久化
- 房间列表分区（直播中 / 未开播）、封面与列表两种视图、拖拽排序、星标收藏与「只看收藏」
- 显示已播时长与上次直播时间，60 秒轮询开播状态
- WebSocket 弹幕流实时接收（弹幕、礼物、醒目留言、上舰、进场、点赞、开播/下播）
- 三栏消息布局（礼物 / 弹幕 / 活动），栏高可拖拽，活动栏三态（滚动列表 / 只看最新 / 隐藏）与栏内过滤
- 弹幕流内联表情渲染与大表情，表情包收藏与按房间/账号隐藏
- 醒目留言真实配色（六档金额配色可自定义），礼物与舰长金额胶囊前置
- 关键词与用户屏蔽（右键消息直接屏蔽），礼物类型与电池数量筛选
- 用户信息显隐（昵称、昵称颜色、荣耀等级、粉丝牌、房管标志、高能榜）
- 文字弹幕（40 字上限、输入法安全）与表情弹幕发送
- 自动发送（文字/表情/点赞三 Tab，间隔 + 限时可调，切房自动停止）与自动点赞（目标/批次/间隔）
- 快捷消息模板（SQLite 持久化）
- 系统托盘常驻（单击切换当前窗口，右键切换直播间/账号/退出）
- 图片代理（域名白名单 + SQLite 缓存 + 前端内存 LRU，绕过 CDN Referer 防盗链）
- 实时直播音频流播放（v2 API + 本地代理绕过 CORS + mpegts.js FLV 播放）
- 实时语音转字幕（sherpa-onnx 流式识别 + 字幕叠加层，始终编译，设置中开关）
- 弹幕窗口背景透明度 10–100%、贴边吸附收起、仅输入框模式、点击透传、隐身模式
- 全局快捷键与界面缩放，窗口位置/尺寸/模式持久化
- 自定义窗口标题栏（无原生装饰，全部窗口统一风格）

### 听视频

- BV 号 / 视频链接直达，关键词搜索，收藏夹与稍后再看作为播放列表
- 分 P 与合集切换、双层播放队列、顺序/随机/单曲循环/列表循环
- 视频原有字幕逐句高亮跟随，离开播放页后底部迷你播放条继续控制
- 视频评论区浏览、回复、点赞（需登录）
- 与直播互斥：进入直播间时视频音频自动暂停

### 其他

- 浅色/深色/跟随系统，深浅各六套主题预设，强调色/背景/表面/前景可自定义
- 金额档位配色、弹幕字号、界面缩放、界面与内容字体
- 消息缓存上限（三栏共用，0 = 不限）、图片缓存分类清理
- 设置自动保存，启动检查更新
- 礼物打赏（发送礼物）为编译期可选功能，官方构建默认关闭，见下文

## 技术栈

| 层       | 技术                                                                      |
| -------- | ------------------------------------------------------------------------- |
| 桌面框架 | Tauri 2                                                                   |
| 前端     | React 18 + TypeScript + Vite 7                                            |
| 状态管理 | Zustand 5                                                                 |
| 样式     | TailwindCSS 3 + Radix UI                                                  |
| 图标     | Lucide React                                                              |
| 后端     | Rust (reqwest, tokio-tungstenite, brotli, flate2, sherpa-onnx, symphonia) |
| 音频播放 | mpegts.js (FLV→fMP4→MSE) / HTMLAudioElement（听视频）                      |
| 持久化   | SQLite (rusqlite) + tauri-plugin-store                                    |

## 开发

### 环境要求

- Node.js 18+
- Rust (rustup)
- Windows 10+（WebView2 运行时）/ macOS / Linux（webkit2gtk 4.1）

### 安装依赖

前端共享组件通过同级 `../danmaku-core/packages/ui` 本地包引用。首次使用时，将公共仓库克隆到同级目录。

```bash
git clone https://github.com/sfqy211/danmaku-core.git ../danmaku-core
```

已有公共仓库时先获取远端更新。然后从客户端根目录检出固定修订、构建公共包并安装客户端依赖。

```bash
git -C ../danmaku-core fetch origin
git -C ../danmaku-core checkout --detach "$(node scripts/shared-core-revision.mjs)"
npm --prefix ../danmaku-core ci
npm --prefix ../danmaku-core run build
npm ci
```

`typecheck`、`build:renderer` 和 `dev:renderer` 会先构建共享 UI。客户端保留设置、图片代理、屏蔽持久化和 Tauri 回调适配，展示组件与规则由 `@danmaku-core/ui` 提供。`scripts/shared-core-revision.mjs` 从 `src-tauri/Cargo.toml` 读取固定修订，Rust 和前端使用同一份公共源码版本。

Rust 事件模型和 Bilibili 协议解析依赖公开的 `sfqy211/danmaku-core` 仓库。`src-tauri/Cargo.toml` 的 `rev` 与 `Cargo.lock` 固定公共核心修订，常规开发、CI 和打包由 Cargo 自动获取源码。

需要联调公共源码时，将 `danmaku-core` 克隆到客户端同级目录。从 `src-tauri/` 执行以下 PowerShell 命令，使用本地 path 覆盖，并把联调锁文件保存到被忽略的构建目录。该锁文件配置需要 Cargo 1.97 及以上版本。

```powershell
New-Item -ItemType Directory -Force 'target/local-core' | Out-Null
Copy-Item -LiteralPath 'Cargo.lock' -Destination 'target/local-core/Cargo.lock'
cargo check `
  --config "patch.'https://github.com/sfqy211/danmaku-core.git'.danmaku-core.path='../../danmaku-core/crates/danmaku-core'" `
  --config "resolver.lockfile-path='target/local-core/Cargo.lock'"
```

同样的两个 `--config` 参数可用于 `cargo test --lib`，正式锁文件继续记录固定 Git 来源。共享核心源码的测试命令见 `tests/README.md`。

### 启动开发

```bash
npm run dev        # 完整开发模式（Vite 前端 + Tauri 窗口）
npm run dev:mock   # 同上，并启用虚拟直播间（无需真实直播间）
npm run dev:gift   # 同上，并开启礼物打赏编译特性
```

启动 Vite 前端（`localhost:3000`，`strictPort`，端口被占用会直接失败）+ Tauri 桌面窗口。

### 常用命令

| 命令                                   | 说明                         |
| -------------------------------------- | ---------------------------- |
| `npm run dev`                          | 完整开发模式（前端 + Tauri） |
| `npm run dev:mock`                     | 开发模式 + 虚拟直播间        |
| `npm run dev:gift`                     | 开发模式 + 礼物打赏特性      |
| `npm run dev:renderer`                 | 仅前端（Vite）               |
| `npm run typecheck`                    | TypeScript 类型检查          |
| `cargo check` (在 src-tauri/)          | Rust 编译检查                |
| `npm run build`                        | 构建发布包                   |
| `npm run build:gift`                   | 构建带礼物打赏的发布包       |
| `.\scripts\bump-version.ps1 <version>` | 更新所有版本号               |

## 测试

虚拟直播间：`npm run dev:mock` 启动后，房间列表出现"测试直播间（虚拟）"，本地模拟弹幕服务器提供弹幕/礼物/SC/舰长/进场/点赞/上下播等全事件流，并通过本地 HTTP 控制面（`127.0.0.1:23331`）注入断线重连、消息洪峰、网络延迟、指定事件等场景——不连接真实直播间即可完成所有功能测试。详见 [tests/README.md](tests/README.md)。

## 礼物打赏（编译期开关）

弹幕窗内置礼物打赏（发送礼物）功能，因涉及**真实扣费**，由 Cargo feature `gift-send` 门控：**官方发布的安装包默认不包含此功能**，界面上也没有对应入口。

如需使用，请自行编译开启：

```bash
# 方式一：npm 专用脚本（开发 / 打包）
npm run dev:gift
npm run build:gift

# 方式二：直接用 cargo（在 src-tauri/ 下）
cargo build --release --features gift-send

# 方式三：把 src-tauri/Cargo.toml 里 gift-send 加入 default 后正常打包
[features]
default = ["gift-send"]
gift-send = []
```

开启后弹幕窗发送栏会出现礼物按钮。发送金瓜子礼物（1000 金瓜子 = 1 元）前有二步确认；余额在发送后由前端本地扣减（B 站余额接口有秒级缓存）。开发调试礼物面板请用 `npm run dev:gift`。是否开启、如何使用完全由自行编译者决定并自担责任。

## 项目结构

```
src/                          前端 (React + TypeScript)
├── pages/                    页面（RoomPage, DanmakuPage, AccountPage, SettingsPage,
│                             ListenHomePage/WatchLaterPage/ListenFavPage,
│                             VideoAddPage/VideoPlayerPage/VideoCommentsPage, RoomAddPage, AIPage）
├── components/               组件
│   ├── danmaku/              弹幕相关（DanmakuMessageItem, AccountSwitcher, RoomSwitcher,
│   │                         EmoticonPickerPanel, AutoSendPanel, GiftPanel, FilterPanel,
│   │                         MessageClipboardPanel, SubtitleOverlay, FloatingPanel, MedalBadge）
│   ├── layout/               布局（WorkspaceLayout, AppLayout, AppSidebar, WorkspaceSidebar,
│   │                         TitleBar, PageHeader）
│   ├── listen/               听视频（MiniPlayer, PlayerControls, PlaylistTreePanel,
│   │                         SubtitlePanel, VideoCollectionPage）
│   ├── settings/             设置分区（通用/快捷键/外观/弹幕窗口/直播音频/听视频/存储/关于）
│   ├── rooms/                收藏管理（FavoriteManageDialog）
│   ├── add/                  添加直播间/视频共用的搜索页（AddSearchPage）
│   └── ui/                   通用 UI（ProxiedImage, InlineMessage, ConfirmDialog, CloseDialog,
│                             UpdateDialog, Select, checkbox, slider）
├── hooks/                    React Hooks（useDanmakuStream, useAutoSend, useAutoLike,
│                             useAudioPlayer, useSttTranscript, useTheme, useBackgroundTheme,
│                             useWindowDock, useProxyImage, useDividerDrag, useInfiniteScroll,
│                             useUiScale, useZoom, useUpdateCheck, useTauriEvent...）
├── stores/                   Zustand 状态（auth, room, danmaku, settings, ui, video-audio）
├── lib/                      tauri.ts（IPC 封装）、theme/visual-theme/brand-theme、app-history 等
└── types/                    TypeScript 类型定义

src-tauri/                    后端 (Rust)
├── src/bili/                 B站协议实现（api, ws_client, protocol, wbi, credential, buvid,
│                             heartbeat, pb（protobuf 最小解码）, mock（虚拟直播间））
├── src/commands/             Tauri IPC 命令（auth, room, danmaku, gift, video, settings,
│                             proxy, stt, selections, message_template, update, download,
│                             log, websocket）
├── src/models/               数据模型
├── src/stt/                  语音识别（FLV 解复用、AAC 解码、sherpa-onnx 流式识别）
├── src/proxy/                本地 HTTP 流代理（hyper 1.x，STT 字节流 tee；直播流 + 视频流双槽）
├── src/tray.rs               系统托盘
├── src/window_dock.rs        侧边吸附收起
├── src/window_state.rs       弹幕窗口几何持久化
├── src/window_stealth.rs     隐身模式
├── src/shortcuts.rs          全局快捷键
├── src/send_queue.rs         发送队列（人工/自动优先级）
├── src/screen_luminance.rs   背景亮度采样
└── lib.rs                    应用入口 + AppState

tests/                        测试（测试手册 + 场景脚本，见 tests/README.md）
docs/                         Docusaurus 文档站（用户指南 / 技术架构 / API 参考 / 设计规范 / 调研）
```

## 文档

`docs/` 目录包含 Docusaurus 文档站，线上地址 <https://sfqy211.github.io/bilidanmu/>：

| 目录 | 说明 |
| --- | --- |
| [docs/docs/guide/](docs/docs/guide/) | 用户指南（快速开始、功能介绍、使用教程） |
| [docs/docs/architecture/](docs/docs/architecture/) | 技术架构（架构总览、项目结构、数据流） |
| [docs/docs/api/](docs/docs/api/) | API 参考（B 站 API、IPC 命令、事件列表） |
| [docs/docs/design/](docs/docs/design/) | 设计规范（设计风格、页面布局） |
| [docs/docs/research/](docs/docs/research/) | 技术调研（协议调研、方案选型） |
| [docs/design/](docs/design/) | 功能设计记录（如礼物打赏） |

先按安装依赖小节准备共享 UI 与客户端依赖，再运行 `cd docs && npm ci && npm run dev` 进行本地预览。文档首页读取共享金额规则。GitHub Actions 在 workspace 内将客户端与固定修订的公共仓库检出为相邻子目录，按公共包、客户端、docs 的顺序安装与构建。推送到 `main` 且改动文档、共享依赖来源或文档工作流时，会构建 Docusaurus 站点并部署到 GitHub Pages。

`.github/workflows/ci.yml` 在 Windows、macOS、Linux 执行类型检查、renderer 构建及带锁的 Rust 检查、测试和原生 debug 构建，并单独检查 docs 构建。该工作流可手动触发，用于验证当前固定来源的完整构建链路。

## 发布

推送 `main` 且 `src-tauri/tauri.conf.json` 的版本号变化时，GitHub Actions 会构建 Windows（x64）、macOS（Universal）、Linux（x64）三平台安装包并发布为 GitHub Release，标签 `app-v<version>`。版本变动等于发布触发器，用 `.\scripts\bump-version.ps1 <version>` 统一改版本号。

## 许可

本项目基于 [GNU Affero General Public License v3.0](LICENSE) 开源。

### 参考项目

本项目在开发过程中参考了以下开源项目：

| 项目                                                                                       | 许可证       |
| ------------------------------------------------------------------------------------------ | ------------ |
| [cc-switch](https://github.com/farion1231/cc-switch)                                       | MIT          |
| [BLSPAM](https://github.com/ADJazzzz/BLSPAM)                                               | MIT          |
| [PiliPlus](https://github.com/bggRGjQaUbCoE/PiliPlus)                                      | GPLv3        |
| [simple_live_app](https://github.com/xiaoyaocz/dart_simple_live)                           | MIT          |
| [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)             | CC BY-NC 4.0 |
| [bilibili-api](https://github.com/Nemo2011/bilibili-api)                                   | GPLv3        |
| [fansMedalHelper](https://github.com/XiaoMiku01/fansMedalHelper)                           | GPLv3        |
| [danmuai](https://github.com/PEPETII/danmuai)                                              | GPLv3        |
| [chatterbox](https://github.com/laplace-live/chatterbox)                                   | AGPLv3       |
| [live-moyu](https://github.com/amount-chen/live-moyu)                                      | MIT          |
| [JLiverTool](https://github.com/Xinrea/JLiverTool)                                         | MIT          |
| [BilibiliApis](https://github.com/cv-cat/BilibiliApis)                                     | 未声明许可   |

`bilibili-API-collect` 采用 CC BY-NC 4.0 许可（禁止商业使用），本项目的 B 站 API 文档参考自该项目，同样禁止将本项目用于商业用途。
