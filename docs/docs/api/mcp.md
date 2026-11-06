# MCP 工具参考

「AI 接入」启动的本地 MCP server 把应用能力暴露为工具。本页列出全部工具、参数与
返回值，以及协议细节。

- 端点：`http://127.0.0.1:23332/mcp`
- 鉴权：`Authorization: Bearer <token>`（token 在「AI 接入」页复制）
- 传输：Streamable HTTP，`POST /mcp` 返回 `application/json`（不使用 SSE）
- 协议版本：`2025-06-18` / `2025-03-26` / `2024-11-05`

## 协议方法

| 方法 | 说明 |
| --- | --- |
| `initialize` | 握手，返回 `protocolVersion`、`capabilities.tools`、`serverInfo` |
| `notifications/initialized` | 客户端通知，返回 202 空体 |
| `tools/list` | 返回全部工具的 `name` / `title` / `description` / `inputSchema` / `annotations` |
| `tools/call` | 调用工具，参数为 `{ name, arguments }` |
| `ping` | 连通性检查 |

`tools/call` 的返回：

```json
{
  "content": [{ "type": "text", "text": "<紧凑 JSON>" }],
  "structuredContent": { "ok": true, "data": { } },
  "isError": false
}
```

业务失败时 `isError` 为 `true`，`structuredContent.error` 给出结构化错误码：

| 错误码 | 含义 | 建议动作 |
| --- | --- | --- |
| `NOT_LOGGED_IN` | 未登录 | 让用户扫码登录，或调用 `account_list` 选账号 |
| `NOT_IN_ROOM` | 未进入直播间 | 先 `room_join` 或 `room_list` |
| `INVALID_ARGS` | 参数不合法 | 按 `inputSchema` 修正 |
| `UNKNOWN_TOOL` | 工具名不存在 | 调 `tools/list` |
| `FEATURE_DISABLED` | 编译期能力缺失（如送礼） | 说明后放弃，不要重试 |
| `DUPLICATE_MESSAGE` | 20 秒内相同弹幕 | 换文案或等待 |
| `USER_DENIED` | 用户拒绝了确认 | 不要原样重试 |
| `NEEDS_CONFIRMATION` | 确认超时，附 `confirmationId` | 可带同一 id 重试 |
| `TOOL_FAILED` | 底层业务失败 | 读 `message` 判断 |

## 风险等级与确认

| 等级 | 行为 |
| --- | --- |
| `read` | 任何权限模式都直接执行 |
| `write` | 变更前确认模式下需确认 |
| `costly` | 自主模式与变更前确认模式都需确认 |
| `destructive` | 同上，且不可逆 |

## 工具清单

### 应用

| 工具 | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `app_get_status` | read | — | 版本、登录态、当前房间、WS 连接、礼物能力、权限模式、MCP 状态 |
| `app_refresh_rooms` | read | — | 重新拉取房间标题与开播状态 |
| `app_reveal_window` | read | — | 显示并聚焦主窗口 |
| `app_get_permission` | read | — | 当前权限模式与三档含义 |

### 直播上下文

| 工具 | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `live_get_context` | read | `danmakuLimit`(1-300, 默认 40)、`giftLimit`(0-200, 默认 20)、`includeActivity`(默认 false) | 直播间全貌：房间/标题/开播时长/人气/在线/看过/点赞/弹幕速率 + 最近弹幕 + 礼物聚合 + TOP 发言者 |
| `live_query_danmaku` | read | `keyword`、`limit`(1-300, 默认 50) | 在缓冲区里按关键词检索弹幕（匹配内容或用户名） |
| `live_get_stats` | read | — | 只返回实时指标，不含弹幕正文 |

### 账号

| 工具 | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `account_list` | read | — | 已登录账号（不含 cookie） |
| `account_get_current` | read | — | 当前登录态与能否发送 |
| `account_get_wallet` | read | `roomId` | 金/银瓜子余额 |
| `account_switch` | write | `accountId`* | 切换活跃账号 |
| `account_remove` | destructive | `accountId`* | 删除本地凭据（不可逆） |

### 房间

| 工具 | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `room_list` | read | `onlyLive`(默认 false) | 已保存房间 + 实时开播状态 |
| `room_search` | read | `keyword`*、`mode`(`roomId`/`link`/`name`) | 搜索直播间 |
| `room_get` | read | `roomId`* | 房间详情（含主播 uid，送礼需要） |
| `room_live_status` | read | — | 全部已保存房间的开播状态 |
| `room_follow_lives` | read | — | 关注列表中正在直播的主播 |
| `room_join` | write | `roomId`* | 进入直播间（与手动点击行为一致） |
| `room_leave` | write | — | 离开当前直播间 |

### 弹幕

| 工具 | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `danmaku_get_emoticons` | read | `roomId` | 房间表情包（优先本地缓存） |
| `danmaku_send` | **costly** | `roomId`、`message`*(≤20 字)、`color`、`mode` | 发送文字弹幕，经发送队列限流 |
| `danmaku_send_emoticon` | **costly** | `roomId`、`emoticonUnique`*、`emoticonOptions` | 发送表情弹幕 |
| `danmaku_like` | write | `roomId`、`anchorId`、`clickTimes`(1-100) | 给直播间点赞 |
| `auto_send_start` | **costly** | `roomId`、`entries`*（≤20 条，含 `message`/`dmType`/`emoticonOptions`）、`intervalMs`(≥300，默认 3000，会抬到用户设置的最小发送间隔)、`timeLimitSecs` | 后台循环发送，一次确认覆盖整段循环；与模型会话无关 |
| `auto_send_stop` | write | — | 停止循环发送 |
| `auto_like_start` | write | `roomId`、`anchorId`、`targetTotal`(1-1000，默认 100)、`batchSize`(1-100，默认 20)、`intervalMs`(≥500，默认 5000) | 分批点赞到目标次数后自动停止 |
| `auto_like_stop` | write | — | 停止自动点赞 |
| `auto_status` | read | — | 循环发送 / 自动点赞是否还在后台运行 |
| `template_list` | read | — | 消息模板列表 |
| `template_save` | write | `id`、`title`*、`content`* | 新建（无 id）或更新模板 |
| `template_delete` | write | `id`* | 删除模板 |

### 礼物

| 工具 | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `gift_list` | read | `roomId` | 房间礼物面板（含 `giftId`、`price`） |
| `gift_bag` | read | `roomId` | 礼物背包 |
| `gift_send` | **costly** | `roomId`、`giftId`*、`giftNum`(1-999)、`coinType`、`price`（金瓜子必填）、`ruid`、`bagId` | 送礼物，金瓜子真实扣费（1000 = 1 元） |

### 视频

| 工具 | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `video_search` | read | `keyword`*、`page` | 搜索视频 |
| `video_get_info` | read | `bvid`* | 视频详情（含 `aid`、分P `cid`） |
| `video_get_subtitle` | read | `bvid`*、`cid` | 字幕逐行文本 |
| `video_get_comments` | read | `bvid`*、`page`、`sort`(1 热度 / 0 时间) | 一级评论 |
| `video_get_replies` | read | `bvid`*、`root`*、`page` | 楼中楼回复 |
| `video_fav_folders` | read | — | 收藏夹列表 |
| `video_fav_list` | read | `mediaId`*、`page`、`size` | 收藏夹内容 |
| `video_watch_later` | read | — | 稍后再看 |
| `video_play` | write | `bvid`* | 在桌面端打开并播放 |
| `video_stop` | write | — | 停止视频音频 |
| `video_comment_like` | write | `oid`*、`rpid`*、`like` | 评论点赞/取消 |
| `video_comment_post` | **costly** | `oid`*、`message`*、`root`、`parent` | 发表公开评论 |

### 设置

| 工具 | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `settings_get` | read | `keys` | 读取设置（默认剔除快捷键与外观） |
| `settings_patch` | write | `patch`* | 局部修改，仅接受 `sendInterval`/`rateLimit`/`riskControl`/`receive`/`filter` |

> 带 `*` 的参数为必填。

## curl 示例

```bash
TOKEN='<在 AI 接入页复制的 token>'

# 握手
curl -s -X POST http://127.0.0.1:23332/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}'

# 列工具
curl -s -X POST http://127.0.0.1:23332/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 读直播间上下文
curl -s -X POST http://127.0.0.1:23332/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"live_get_context","arguments":{"danmakuLimit":20}}}'
```
