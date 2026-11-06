# AI 工具层与 MCP Server 设计记录

> 2026-11-06 实现。目标：把桌面端全部能力封装成 AI 易用的工具，并通过本地
> MCP server 暴露给 Claude Code / Cursor / Cline 等外部客户端。

## 为什么不是"把 99 个命令暴露出去"

命令层是给 UI 用的：参数是内部 id、返回是完整结构体、错误是中文 `String`。
模型面对这种接口会挑错工具、编造 id、被无关字段淹没。所以另起一层
**意图级工具**（`danmaku_send` 而不是 `send_danmaku` + 三个布尔开关），
参数少、描述面向"何时用"，返回只留语义字段。

## 三层结构

```
外部 AI 客户端 ──HTTP(JSON-RPC)──┐
                                  ├─→ mcp/server.rs ─┐
主窗口前端 ──────Tauri IPC────────┤                  ├─→ ai/dispatch.rs ─→ 现有业务实现
（AIPage 调试面板）               └──────────────────┘        │
                                                              ├─ policy（三档权限）
                                                              ├─ confirm（确认通道）
                                                              ├─ send_queue（限流）
                                                              └─ audit（SQLite）
```

**唯一入口**：`ai::dispatch::call_tool(app, &AppState, name, args, origin)`。
MCP handler 与前端调试面板都只调它，因此权限、限流、审计不可能被绕过。

**一条代码路径**：有 UI 副作用的操作（进房/退房）直接调命令层的
`switch_room` / `exit_room`——`#[tauri::command]` 函数本身也是普通 async fn，
用 `app.state::<AppState>()` 就能拿到 `State`。因此 AI 进房会与手动点击一样
刷新托盘、隐藏主窗口、切路由，不会出现状态分叉。

## 三档权限

| 模式 | 存储值 | 规则 |
| --- | --- | --- |
| 变更前确认 | `confirmAll` | 所有非只读工具都弹确认 |
| 自主模式（默认） | `autonomous` | 仅 `Costly` / `Destructive` 弹确认 |
| 完全访问 | `full` | 全部直接执行 |

风险分级：

| 等级 | 含义 | 工具 |
| --- | --- | --- |
| `Read` | 只读，任何模式直通 | 全部查询类 |
| `Write` | 写但不产生公开内容、不花钱 | `danmaku_like` `video_comment_like` `settings_patch` `template_save/delete` `room_join/leave` `video_play/stop` `account_switch` |
| `Costly` | 花钱或产生公开内容 | `danmaku_send` `danmaku_send_emoticon` `video_comment_post` `gift_send` |
| `Destructive` | 不可逆 | `account_remove` |

> 发弹幕定为 `Costly`：它产生对外公开内容且受 B 站风控约束，与"点赞"不同量级。

**确认通道**：调度器生成 `confirmationId` → `emit("ai-confirm-request")` 给主窗口
→ `ConfirmRequestDialog` 展示 → `ai_confirm_response` 唤醒等待方。
主窗口原本隐藏时会临时显示，用户决定后再隐藏回去。等待上限 55s（MCP 客户端
普遍 60s 超时），超时返回 `NEEDS_CONFIRMATION` + 可重试的 id。

## 直播间上下文缓冲

`bili/ws_client.rs` 原本收到消息只 `emit` 给前端，Rust 侧不留痕。但 MCP server
跑在 Rust 进程内，读不到 React 的 zustand store，所以新增
`ai::context::LiveContext`：**环形缓冲**（弹幕 2000 / 礼物 500 / 活动 500），
外加人气、在线、看过、点赞、标题、60 秒弹幕速率桶。

WS 客户端在 emit 旁边写入缓冲，进房时 `reset_for_room`（旧房间的弹幕不该出现在
新房间上下文里），断连时置 `connected = false`。

`live_get_context` 是整层的价值核心：一次返回房间全貌 + 最近弹幕 + 礼物聚合 +
TOP 发言者 + 速率，模型 90% 的"理解直播间"需求靠这一个工具。

## 发送走队列而非直发

`send_queue.rs` 原本是死代码（`SendPriority::Ai` 早预留、实例也创建了，但零个
`enqueue` 调用）。AI 发送接入它，从而**复用用户设置里的发送间隔**——模型不该
拥有比界面更快的刷屏能力。

为此补了两处：

- `QueueItem.respond: Option<oneshot::Sender<SendResult>>`：AI 需要知道真实发送结果
- `QueueItem.seq` + `Ord` 里按序号反比：`BinaryHeap` 是最大堆，同优先级下不补
  序号会乱序

另有 20 秒相同文本去重（`danmaku.send`）：重复刷屏是风控高危动作。

## MCP 协议实现

不引入 `rmcp`：所需协议面只有 4 个方法，而 `hyper 1` + `hyper-util` 已在依赖里
（`proxy/stream_proxy.rs` 就是同款范式），手写约 400 行比新增一个版本不可控的
依赖更稳。

- Transport：**Streamable HTTP**，`POST /mcp` 返回 `application/json`（不启用 SSE）
- `GET /mcp` → 405（本实现不提供 SSE 流）
- 版本协商：`2025-06-18` / `2025-03-26` / `2024-11-05`，未知版本回落到最新
- 方法：`initialize`、`notifications/initialized`（202 空体）、`tools/list`、`tools/call`、`ping`
- 鉴权：`Authorization: Bearer <token>`，定长比较避免前缀泄露
- 端口固定 `23332`（避开 mock 的 23330/23331）
- `tools/call` 同时返回 `content[].text`（紧凑 JSON）与 `structuredContent`；
  业务失败走 `isError: true` 而非 JSON-RPC 错误，让模型看到结构化错误码
- 绑定失败只降级（AIPage 显示错误），不影响应用其余功能

**为什么不做 stdio**：`tauri-plugin-single-instance` 会让第二个进程直接退出，
客户端拉起的 stdio 子进程根本起不来。因此必须由常驻进程自己监听端口。

## 刻意不封装的能力

`proxy_image`、`clear_image_cache`、`sample_background_luminance`、
`open_file_path`、`open_log_dir`、`download_file`、`check_update`、
窗口几何/吸附/隐身底层命令——都是 UI 管道，暴露给模型只会增加幻觉面。

## 设置写入为什么是白名单

`settings_patch` 只接受 `sendInterval` / `rateLimit` / `riskControl` /
`receive` / `filter`。原因有两层：

1. 整包写 `Settings` 会撞上已知的嵌套合并陷阱（前端 `mergeSettings` 只深合并
   一级，缺字段会让旧库用户的设置页崩溃）
2. 模型不该改窗口几何、快捷键、STT 模型路径这类它无从判断的配置

被忽略的字段会在返回的 `ignored` 里列出，让模型知道为什么没生效。

## 已知限制

- 弹幕缓冲不持久化，只保留最近 2000 条，不含历史回放
- 确认等待超时后模型必须重新发起调用（可用同一 `confirmationId`，但语义上
  仍会再问一次用户）
- 队列的 `min_interval_ms` 固定 1000ms，未接用户设置里的 `sendInterval` 区间
  （后续可改进：从 `settings.send_interval` 取随机值）
- MCP token 明文存于 `app_metadata`，与其它本地配置同级
