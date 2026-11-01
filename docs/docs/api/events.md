# 事件列表

后端通过 Tauri 的事件机制向前端推送实时数据。前端使用 `listen` 监听这些事件。

## 监听方式

```typescript
import { listen } from '@tauri-apps/api/event'

await listen<DanmakuMessage>('danmaku-received', (event) => {
  console.log(event.payload)
})
```

## 弹幕事件

### `danmaku-received`

普通弹幕消息。

```typescript
interface DanmakuMessage {
  id: string
  roomId: number
  type: 'danmaku' | 'gift' | 'superChat' | 'guard' | 'entry' | 'like' | 'system'
  username: string
  content: string
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
  contributionRank?: number
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

WebSocket 连接成功。

```typescript
interface WsConnectedPayload {
  roomId: number
}
```

### `ws-disconnected`

WebSocket 连接断开。

```typescript
interface WsDisconnectedPayload {
  reason: string
}
```

### `ws-heartbeat`

心跳响应，包含在线人数。

```typescript
interface WsHeartbeatPayload {
  popularity: number
}
```

## 互动事件

### `like-count-update`

点赞数更新。

```typescript
interface LikeCountUpdatePayload {
  roomId: number
  clickCount: number
}
```

### `online-count-update`

在线人数更新。

```typescript
interface OnlineCountUpdatePayload {
  roomId: number
  onlineCount: number
}
```

## 自动发送事件

### `auto-send-tick`

自动发送 tick。

```typescript
interface AutoSendTickPayload {
  // 发送状态信息
}
```

### `auto-send-error`

自动发送错误。

```typescript
interface AutoSendErrorPayload {
  error: string
}
```

### `auto-send-stopped`

自动发送停止。

```typescript
interface AutoSendStoppedPayload {
  reason: 'manual' | 'error' | 'timeLimit' | string
}
```

## 自动点赞事件

### `auto-like-tick`

自动点赞 tick。

```typescript
interface AutoLikeTickPayload {
  // 点赞状态信息
}
```

### `auto-like-error`

自动点赞错误。

```typescript
interface AutoLikeErrorPayload {
  error: string
}
```

### `auto-like-stopped`

自动点赞停止。

```typescript
interface AutoLikeStoppedPayload {
  reason: string
  totalSent?: number
}
```

## 房间事件

### `rooms-updated`

房间列表更新。

### `room-switched`

房间切换（来自托盘）。

```typescript
interface RoomSwitchedPayload {
  roomId: number
}
```

## 账号事件

### `account-switched`

账号切换。

```typescript
interface AccountSwitchedPayload {
  uid: number
  username: string
}
```

### `account-switch-error`

账号切换错误。

```typescript
interface AccountSwitchErrorPayload {
  error: string
}
```

## STT 事件

### `stt-transcript`

字幕更新。

```typescript
interface SttTranscript {
  text: string
  isFinal: boolean
}
```

## Dock 事件

### `dock-changed`

窗口 Dock 状态变更。

```typescript
interface DockChangedPayload {
  label: string
  state: 'expanded' | 'collapsed' | 'collapsing' | 'expanded'
}
```

## 下载事件

### `download-progress`

下载进度。

```typescript
interface DownloadProgressPayload {
  filename: string
  progress: number
  total: number
}
```

### `downloaded`

下载完成。

```typescript
interface DownloadedPayload {
  path: string
  filename: string
}
```

## 设置事件

### `settings-changed`

设置变更。

```typescript
interface SettingsChangedPayload {
  key: string
  value: unknown
}
```
