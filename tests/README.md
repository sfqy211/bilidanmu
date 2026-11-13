# 测试指南

面向人工与智能体的测试手册。新增测试脚本请放在本目录，命名建议 `test-<场景>.<sh|ps1|js>`。

## 1. 测试手段总览

| 手段 | 覆盖面 | 前置条件 |
| --- | --- | --- |
| 虚拟直播间（`npm run dev:mock`） | 全链路：协议解析 → 事件广播 → 前端渲染 | 环境变量 `BILIDANMU_MOCK=1` |
| 控制面 HTTP API | 断线/洪峰/延迟/上下播等场景注入 + 定向事件 | 虚拟直播间已启用（应用运行中） |
| `cargo test --lib bili::mock` | mock 服务器本身（协议回包/生成器/控制面/踢线） | 端口 23330/23331 空闲 |
| 共享核心 `cargo test --workspace --locked` | 协议解析、Protobuf 与事件 JSON 契约 | 同级 `../danmaku-core` 仓库 |
| `npm run typecheck` + `cargo check` | 静态验证（每次改动的最低要求） | 无 |
| 公共 UI `npm test` | 金额、配色、表情与主条目显示契约 | 先在同级公共仓库运行 `npm ci` |

## 2. 虚拟直播间

```bash
npm run dev:mock
```

- 启动时读取环境变量 `BILIDANMU_MOCK=1`，应用内启动本地弹幕服务器（`127.0.0.1:23330`，与 B 站相同的二进制协议）和 HTTP 控制面（`127.0.0.1:23331`）。
- 房间列表顶部出现"测试直播间（虚拟）"卡片（保留房间号 **0**），点开即进。
- 不带该环境变量启动（`npm run dev`）或发布版完全不受影响，mock 代码不运行。

**默认事件节奏**：弹幕 1 秒/条；礼物族（礼物/SC/舰长轮换）8 秒/条；进场/关注/分享 12 秒；点赞 7 秒；在线人数 10 秒；连接即推送开播标记。

**已知限制（预期行为）**：无直播流 → 音频播放/STT 不可用；发送弹幕/表情、表情包拉取在虚拟直播间被跳过（避免对真实房间误发）。

## 3. 控制面 API（`http://127.0.0.1:23331`）

约定：仅 mock 启用时监听，仅绑定本地回环；请求/响应均为 JSON；未知路径返回可用端点列表。
PowerShell 下请用 `curl.exe`（`curl` 是 `Invoke-WebRequest` 的别名，参数不兼容）。

### 端点参考

| 端点 | 方法 | 作用 |
| --- | --- | --- |
| `/status` | GET | 查看当前模拟配置 |
| `/config` | POST | 调整频率与延迟（字段可省略） |
| `/live` | POST | 触发开播（窗口出现红色"开播了"） |
| `/preparing` | POST | 触发下播（灰色"下播了"，生成器暂停） |
| `/kick` | POST | 踢线：服务端主动断开，演练客户端重连退避（5/10/30/60 秒） |
| `/event` | POST | 手工注入单条事件 |
| `/burst` | POST | 消息洪峰 |

> 注：`/burst` 与开播状态无关，下播状态同样注入（纯压力测试）；`giftIntervalMs=0` 只停礼物族（礼物/SC/舰长），进场（12 秒）与点赞（7 秒）按固定节奏继续发送。

### 参数与示例

```bash
# 调频率：弹幕每 50ms 一条（≈20 条/秒），礼物每 2 秒，每条延迟 300ms 模拟网络抖动
curl.exe -X POST http://127.0.0.1:23331/config -d "{\"danmakuIntervalMs\":50,\"giftIntervalMs\":2000,\"delayMs\":300}"

# 静音：停掉全部自动生成器（弹幕/礼物/进场/点赞/在线人数），只保留手工注入的消息，
# 便于观察单条消息样式（截图时画面里只有自己造的那几条）
curl.exe -X POST http://127.0.0.1:23331/config -d "{\"silent\":true}"

# 手工注入：定向验证某类事件或指定内容
curl.exe -X POST http://127.0.0.1:23331/event -d "{\"type\":\"danmaku\",\"username\":\"测试用户A\",\"content\":\"指定内容\"}"
curl.exe -X POST http://127.0.0.1:23331/event -d "{\"type\":\"superChat\",\"content\":\"指定 SC 内容\"}"
# SC 可带 price 指定金额（默认 30）：配色按 B 站金额档位变化
# 30/50=蓝系、100=橙、500=红、1000=紫、2000+=深红
curl.exe -X POST http://127.0.0.1:23331/event -d "{\"type\":\"superChat\",\"price\":1000,\"content\":\"指定金额的 SC\"}"
# 双语 SC：一次注入同一笔 SC 的普通 + 日语两种下发（同 id），验证只显示一条、译文内联
curl.exe -X POST http://127.0.0.1:23331/event -d "{\"type\":\"superChatJpn\",\"content\":\"指定 SC 内容\"}"
# type 可选：danmaku / gift / superChat / superChatJpn / guard / entry / like / live / preparing

# 洪峰：500 条弹幕、间隔 10ms
curl.exe -X POST http://127.0.0.1:23331/burst -d "{\"count\":500,\"intervalMs\":10}"

# 踢线（客户端将按 5/10/30/60 秒退避重连）
curl.exe -X POST http://127.0.0.1:23331/kick
```

### 场景剧本

**场景 A：上下播循环**（验证开/下播系统行、生成器暂停恢复、场次标记）

```bash
curl.exe -X POST http://127.0.0.1:23331/preparing   # 窗口：灰色"下播了"，弹幕停止
curl.exe http://127.0.0.1:23331/status               # 确认 live:false
curl.exe -X POST http://127.0.0.1:23331/live         # 窗口：红色"开播了"，弹幕恢复
```

**场景 B：洪峰压测**（配合虚拟滚动，验证数千条弹幕不卡顿、贴底跟随）

```bash
curl.exe -X POST http://127.0.0.1:23331/config -d "{\"danmakuIntervalMs\":20}"
# 观察结束后恢复
curl.exe -X POST http://127.0.0.1:23331/config -d "{\"danmakuIntervalMs\":1000}"
```

**场景 C：断线重连**（验证重连退避与"重连中"状态提示）

```bash
curl.exe -X POST http://127.0.0.1:23331/kick
# 观察：窗口出现连接状态变化，~5 秒后自动重连并重新收到开播快照
```

**场景 D：网络抖动**（验证消息延迟下 UI 不卡死）

```bash
curl.exe -X POST http://127.0.0.1:23331/config -d "{\"delayMs\":1500}"
# 恢复
curl.exe -X POST http://127.0.0.1:23331/config -d "{\"delayMs\":0}"
```

**场景 E：三栏布局**（验证活动栏与简化醒目留言）

```bash
# 进场/点赞进活动栏；SC 双重显示需先在设置中开启"弹幕栏简化醒目留言"
curl.exe -X POST http://127.0.0.1:23331/event -d "{\"type\":\"entry\"}"
curl.exe -X POST http://127.0.0.1:23331/event -d "{\"type\":\"like\"}"
curl.exe -X POST http://127.0.0.1:23331/event -d "{\"type\":\"superChat\",\"content\":\"双重显示测试\"}"
```

## 4. 自动化测试（cargo test）

事件模型、协议解析和 Protobuf 实现及其原有测试位于共享核心。以下命令从客户端仓库根目录执行。

```bash
cargo test --manifest-path ../danmaku-core/Cargo.toml --workspace --locked
```

客户端保留共享类型与协议入口的接入回归、SC 去重和 mock 端到端测试。

公共前端包的回归在同级 `danmaku-core` 根目录运行 `npm test`，该命令先构建包，再执行 Node 内置测试。打包消费验证使用 `npm pack --workspace @danmaku-core/ui` 的产物，视觉与交互验证记录放在客户端 `tests/` 中。客户端的 `npm run typecheck`、`npm run build:renderer` 会先构建共享 UI。

干净环境先按根 README 检出 `node scripts/shared-core-revision.mjs` 输出的公共修订，再按公共包、客户端、docs 的顺序安装依赖。CI 同样将两仓放在 workspace 内相邻的 `bilidanmu/` 与 `danmaku-core/` 目录。`.github/workflows/ci.yml` 验证三平台 renderer 与原生 debug 构建、Rust 回归和独立 docs 构建，公共仓库的 CI 验证共享包自身。发布工作流保留版本 tag 判断，已有 tag 时的跳过结果需要与构建检查结果分别核对。

```bash
cd src-tauri
cargo test --lib bili::protocol --locked
cargo test --lib bili::ws_client --locked
cargo test --lib bili::mock
```

覆盖：认证回包（code=0）→ 开播态快照 → 心跳人气值 → 生成器弹幕 → 控制面触发下播 → 踢线断开，共 6 项断言。
注意：测试会绑定 23330/23331 端口，若开发中的应用正在运行（`dev:mock`），测试会因端口占用失败——先关掉应用再跑。

## 5. 面向智能体的约定

1. 测试前置：`npm run dev:mock` 启动应用，确认日志出现 `[mock] 虚拟直播间已启用`。
2. 场景驱动：用控制面接口按上文剧本注入，观察点为弹幕窗口内容与应用日志（`[mock]` 前缀）。
3. 用后恢复：改过 `/config` 的测试结束前恢复默认（弹幕 1000ms、礼物 8000ms、延迟 0），避免污染下一个场景。
4. 新增回归断言：mock 服务器行为的回归写进 `src-tauri/src/bili/mock.rs` 的 `#[cfg(test)]` 模块；面向场景的脚本放本目录。
