# 事件列表

后端通过 Tauri 的事件机制向前端推送实时数据。前端使用 `listen`（或封装好的 `useTauriEvent`）订阅。

## 监听方式

```typescript
import { listen } from '@tauri-apps/api/event'

await listen<DanmakuMessage>('danmaku-received', (event) => {
  console.log(event.payload)
})
```

Rust 侧除 `emit_to("main", ...)` 两处外，其余都是 `app.emit(...)` 全局广播，因此同一个事件会被主窗口和弹幕窗同时收到——监听方需要按窗口 label 或业务状态自行过滤。

## 弹幕消息事件

### `danmaku-received`

一条已解析的直播消息。`type` 决定渲染到哪一栏。

```typescript
interface DanmakuMessage {
  id: string
  roomId: number
  type: 'danmaku' | 'gift' | 'superChat' | 'guard' | 'entry' | 'like' | 'system' | 'live' | 'preparing'
  username: string
  content: string
  contentTrans?: string      // 醒目留言的机翻文案
  timestamp: number
  avatar?: string
  medal?: Medal
  wealthLevel?: number
  price?: number
  giftName?: string
  count?: number
  uid?: number
  color?: number
  guardLevel?: number
  isAdmin?: boolean
  dmType?: number
  backgroundColor?: string
  backgroundBottomColor?: string
  backgroundPriceColor?: string
  messageFontColor?: string
  backgroundImage?: string
  emots?: Record<string, InlineEmoticon>
  emoticonOptions?: BigEmoticonOptions
  replyUid?: number
  replyUsername?: string
  contributionRank?: number  // 高能榜前 3 名
}
```

### `danmaku-sc-translation`

醒目留言的翻译后补（`SUPER_CHAT_MESSAGE_JPN` 与原文分两条到达）。

```typescript
interface ScTranslationPayload {
  roomId: number
  id: string
  contentTrans: string
}
```

### `danmaku-error`

弹幕流错误。

```typescript
interface DanmakuErrorPayload {
  message: string
}
```

## 连接事件

### `ws-connected`

WebSocket 认证成功。

```typescript
interface WsConnectedPayload {
  roomId: number
}
```

### `ws-disconnected`

WebSocket 断开。`reason` 为 `manual`（主动断开）、关闭帧文本或 `socket ended`。

```typescript
interface WsDisconnectedPayload {
  reason: string
}
```

### `ws-heartbeat`

心跳回复，`popularity` 为原始人气值（不是在线人数）。

```typescript
interface WsHeartbeatPayload {
  popularity: number
}
```

## 房间互动事件

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `like-count-update` | `{ roomId, clickCount }` | 本场累计点赞数 |
| `online-count-update` | `{ roomId, onlineCount }` | 在线人数 |
| `watched-count-update` | `{ roomId, watchedCount }` | 累计看过人数 |
| `room-title-changed` | `{ roomId, title }` | 主播修改标题 |

## 自动发送事件

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `auto-send-tick` | `{ roomId, message, dmType, index }` | 成功发送一条 |
| `auto-send-error` | `{ roomId, message, dmType, index, error }` | 某条发送失败 |
| `auto-send-stopped` | `{ reason }` | 停止；`reason` = `manual` / `error` / `time_limit` |

## 自动点赞事件

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `auto-like-tick` | `{ roomId, sentTotal, targetTotal }` | 点赞进度 |
| `auto-like-error` | `{ roomId, sentTotal, error }` | 发送失败 |
| `auto-like-stopped` | `{ reason, sentTotal }` | 停止；`reason` = `manual` / `error` / `completed` |

## 房间与窗口事件

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `rooms-updated` | `()` | 后台刷新完房间标题/封面，前端应重新拉列表 |
| `room-switched` | `roomId: number` | 原地切换直播间（托盘或标题栏切换器触发） |
| `room-exited` | `roomId: number` | 退出直播间（`emit_to("main")`；弹幕窗销毁时兜底发 `0`） |
| `danmaku-entered` | `roomId: number` | 进入直播间（`emit_to("main")`，用于暂停视频音频） |
| `danmaku-input-only` | `boolean` | 仅输入框模式开关结果 |
| `danmaku-input-only-emotes` | `boolean` | 紧凑模式下表情面板展开/收起 |
| `danmaku-stealth` | `{ label, visible, enabled }` | 隐身状态变化 |
| `dock-changed` | `{ label, phase, side? }` | 吸附状态变化；`phase` = `collapsed` / `expanded` / `collapsing`，`side` = `left` / `right` / `top` |

## 账号事件

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `account-switched` | `{ accountId, credential }` | 托盘切换账号后广播 |
| `account-switch-error` | `string` | 切换失败的错误信息 |

## 设置与快捷键

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `settings-changed` | `Settings` | **前端发出**（`settings-store.patchSettings`），用于跨窗口同步设置 |
| `global-shortcut-action` | `"toggleAudio" \| "toggleMute"` | Rust 转发全局快捷键到弹幕窗前端执行 |

## STT 事件

### `stt-transcript`

字幕更新。

```typescript
interface SttTranscript {
  text: string
  isFinal: boolean
}
```

## 下载事件

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `download-progress` | `{ filename, downloaded, total }` | 安装包下载进度，前端换算百分比 |

## AI 工具事件

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `ai-confirm-request` | `{ id, tool, title, message, risk }` | AI 请求执行需确认的操作，主窗口弹确认框；用户决定后经 `ai_confirm_response` 回传 |
| `ai-permission-changed` | `"confirmAll" \| "autonomous" \| "full"` | 权限模式变更，界面同步按钮状态 |
| `ai-tool-activity` | `{ tool, ok }` | 外部 MCP 客户端每调用一次工具后广播，用于刷新调用记录 |
| `ai-navigate` | `{ path }` | 请求主窗口跳到指定路由（如 `video_play` 打开视频页） |

`ai-confirm-request` 的 `id` 是关联键：Rust 侧等待用户决定，超时（55 秒）后该 id
失效，`ai_confirm_response` 会返回 `false`。

## 事件一览

| 事件 | 方向 | 来源模块 |
| --- | --- | --- |
| `ws-connected` / `ws-disconnected` / `ws-heartbeat` | Rust → 前端 | `bili/ws_client.rs` |
| `danmaku-received` / `danmaku-sc-translation` / `danmaku-error` | Rust → 前端 | `bili/ws_client.rs` |
| `like-count-update` / `online-count-update` / `watched-count-update` / `room-title-changed` | Rust → 前端 | `bili/ws_client.rs` |
| `auto-send-*` / `auto-like-*` | Rust → 前端 | `commands/danmaku.rs` |
| `room-switched` / `rooms-updated` / `danmaku-input-only` / `danmaku-input-only-emotes` | Rust → 前端 | `commands/room.rs` |
| `danmaku-entered` / `room-exited` | Rust → 主窗口 | `commands/room.rs`、`lib.rs` |
| `dock-changed` | Rust → 前端 | `window_dock.rs` |
| `danmaku-stealth` | Rust → 前端 | `window_stealth.rs` |
| `account-switched` / `account-switch-error` | Rust → 前端 | `commands/auth.rs`、`tray.rs` |
| `global-shortcut-action` | Rust → 前端 | `shortcuts.rs` |
| `stt-transcript` | Rust → 前端 | `stt/mod.rs` |
| `download-progress` | Rust → 前端 | `commands/download.rs` |
| `settings-changed` | 前端 → 前端（跨窗口） | `stores/settings-store.ts` |
| `ai-confirm-request` | Rust → 主窗口 | `ai/dispatch.rs` |
| `ai-permission-changed` | Rust → 前端 | `ai/commands.rs` |
| `ai-tool-activity` | Rust → 前端 | `mcp/handlers.rs` |
| `ai-navigate` | Rust → 主窗口 | `ai/tools/video.rs` |
