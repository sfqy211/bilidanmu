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
| `NOT_LOGGED_IN` | 未登录 | 让用户扫码登录，或调用 `account{action:"list"}` 选账号 |
| `NOT_IN_ROOM` | 未进入直播间 | 先 `room{action:"join"}` 或 `room{action:"list"}` |
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

`tools/list` 只返回 9 个域工具和 1 个目录查询工具，避免每次会话把所有参数 schema 装进上下文。调用形如：

```json
{ "name": "live", "arguments": { "action": "get_context", "params": { "danmakuLimit": 20 } } }
```

`params` 是该 action 的参数对象。不确定字段时先调 `mcp_describe(domain, action)`，它返回该 action 的完整 JSON Schema、说明与风险等级；不传参数则返回全部域与 action 索引。

| 域 | action |
| --- | --- |
| `app` | status、refresh_rooms、reveal_window、permission |
| `live` | get_context、query_danmaku、get_stats、watch_start、watch_collect、watch_digest、watch_status、watch_stop、watch_list、watch_senders |
| `room` | list、search、get、live_status、follow_lives、join、leave |
| `danmaku` | get_emoticons、send、send_emoticon、like、auto_send_start、auto_send_stop、auto_like_start、auto_like_stop、auto_status、template_list、template_save、template_delete |
| `gift` | list、bag、send |
| `video` | search、get_info、get_subtitle、get_danmaku、danmaku_send、get_comments、get_replies、fav_folders、fav_list、watch_later、watch_later_remove、play、stop、comment_like、comment_post |
| `account` | list、get_current、get_wallet、switch、remove |
| `settings` | get、patch |
| `memory` | get、set、append、list、delete |
| `mcp_describe` | domain?、action? |

> 风险等级按解析后的真实 action 判定（见上一节），与域工具本身无关；确认弹窗里的工具名显示为 `域.action`。
>
> 弹幕中的纯表情默认不返回；需要时用 `includeEmoticons`（上下文/检索）或 `emoticonMode`（长会话）打开，返回项的 `type` 会是 `emoticon`，不会被当成文字。
>
> 长会话默认只返回弹幕与礼物；SC 视为特殊弹幕，只要开启弹幕或礼物任一都会自动带上。进场/点赞/舰长/字幕按需在 `types` 里打开；`types` 每次调用都可改，属于热切换，不重建连接。返回项的 `type` 与 `types` 枚举同名（`enter`、`super_chat`），不会出现内部名 `entry` / `superChat`。

### app

| action | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `status` | read | — | 版本、登录态、当前房间、WS 连接、礼物能力、权限模式、MCP 状态 |
| `refresh_rooms` | read | — | 重新拉取房间标题与开播状态 |
| `reveal_window` | read | — | 显示并聚焦主窗口 |
| `permission` | read | — | 当前权限模式与三档含义 |

### live

| action | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `get_context` | read | `danmakuLimit`(1-300, 默认 40)、`giftLimit`(0-200, 默认 20)、`includeActivity`(默认 false)、`includeEmoticons`(默认 false) | 直播间全貌：房间/标题/开播时长/人气/在线/看过/点赞/弹幕速率 + 最近弹幕 + 礼物聚合 + TOP 发言者；纯表情默认过滤，开启后带 `type=emoticon` |
| `query_danmaku` | read | `keyword`、`limit`(1-300, 默认 50)、`roomId`、`seconds`(3-60, 默认 8)、`includeEmoticons`(默认 false) | 不带 `roomId` 时检索当前房间缓冲；带 `roomId` 时对任意直播间做 3–60 秒临时只读采样；纯表情默认过滤，开启后带 `type=emoticon` |
| `get_stats` | read | — | 只返回实时指标，不含弹幕正文 |
| `watch_start` | write | `roomId`*、`maxMinutes`(0=跟随设置)、`maxEvents`(默认 20000)、`stopOnEnd`(默认 true)、`withTranscript`(默认 false)、`withSenders`(默认 false) | 对任意在播房间开后台长会话；`withSenders` 只是会话默认值，collect 可按次覆盖。`withTranscript` 仅当会话房间就是当前正在收听且已开启 STT 的房间时生效，其他房间会返回 `transcriptHint` 并只收弹幕 |
| `watch_collect` | read | `sessionId`*、`cursor`、`limit`(1-1000)、`types`(默认 `danmaku`+`gift`，自动带 `super_chat`)、`keyword`、`duplicateMode`(merge/keep)、`emoticonMode`(默认 drop)、`includeSenders`、`senderLimit` | 按 seq 游标增量拉取。默认 `merge`：相同正文的**文字弹幕**合并成 `danmakuGroup`（`count`/`firstSeq`/`lastSeq`），只出现一次的仍返回单条（带 `seq`，可用于 `watch_senders`）；默认不带发送者（`username`/`uid` 被移除），传 `includeSenders=true` 即热切换，不重连；纯表情默认丢弃（`emoticonMode=drop`），保留时用 `type=emoticon` / `isEmoticon` / `emojiOnly` 明确标识，合并组为 `emoticonGroup` |
| `watch_senders` | read | `sessionId`*、`seq`、`content`、`fromSeq`、`toSeq` | 默认不返回发送者；需要时按 `seq`（单条）或 `content`（某段相同弹幕）查发送者次数与首末时间，附最多 10 条样本 |
| `watch_digest` | read | `sessionId`*、`topN`、`includeSenders`、`senderLimit` | 只取统计：类型分布、独立用户、TOP 发言者、表情聚合、礼物/SC 汇总、每分钟弹幕量 |
| `watch_status` | read | `sessionId`* | 会话健康度：缓冲、已收/丢弃、连接、重连、结束原因 |
| `watch_stop` | write | `sessionId`*、`remove`(默认 false) | 停止采集；默认保留缓冲供继续 collect |
| `watch_list` | read | — | 列出全部会话（含已结束、保留期内） |

### room

| action | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `list` | read | `onlyLive`(默认 false) | 已保存房间 + 实时开播状态 |
| `search` | read | `keyword`*、`mode`(`roomId`/`link`/`name`/`uid`) | 搜索直播间；`uid` 模式按主播 UID 反查房间 |
| `get` | read | `roomId`* | 房间详情（含主播 uid，送礼需要） |
| `live_status` | read | — | 全部已保存房间的开播状态 |
| `follow_lives` | read | — | 关注列表中正在直播的主播 |
| `join` | write | `roomId`* | 进入直播间（与手动点击行为一致） |
| `leave` | write | — | 离开当前直播间 |

### danmaku

| action | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `get_emoticons` | read | `roomId` | 房间表情包（优先本地缓存） |
| `send` | **costly** | `roomId`、`message`*(≤40 字)、`color`、`mode` | 发送文字弹幕，经发送队列限流 |
| `send_emoticon` | **costly** | `roomId`、`emoticonUnique`*、`emoticonOptions` | 发送表情弹幕 |
| `like` | write | `roomId`、`anchorId`、`clickTime`(1-100) | 给直播间点赞；与 IPC 同名，旧名 `clickTimes` 仍兼容 |
| `auto_send_start` | **costly** | `roomId`、`entries`*（≤20 条，含 `message`/`dmType`/`emoticonOptions`）、`intervalMs`(≥300，默认 3000，会抬到用户设置的最小发送间隔)、`timeLimitSecs` | 后台循环发送，一次确认覆盖整段循环 |
| `auto_send_stop` | write | — | 停止循环发送 |
| `auto_like_start` | write | `roomId`、`anchorId`、`targetTotal`(1-1000，默认 100)、`batchSize`(1-100，默认 20)、`intervalMs`(≥500，默认 5000) | 分批点赞到目标次数后自动停止 |
| `auto_like_stop` | write | — | 停止自动点赞 |
| `auto_status` | read | — | 循环发送 / 自动点赞是否还在后台运行 |
| `template_list` | read | — | 消息模板列表 |
| `template_save` | write | `id`、`title`*、`content`* | 新建（无 id）或更新模板 |
| `template_delete` | write | `id`* | 删除模板 |

### gift

| action | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `list` | read | `roomId` | 房间礼物面板（含 `giftId`、`price`） |
| `bag` | read | `roomId` | 礼物背包 |
| `send` | **costly** | `roomId`、`giftId`*、`giftNum`(1-999)、`coinType`、`price`（金瓜子必填）、`ruid`、`bagId` | 送礼物，金瓜子真实扣费（1000 = 1 元） |

### video

| action | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `search` | read | `keyword`*、`page` | 搜索视频 |
| `get_info` | read | `bvid`* | 视频详情（含 `aid`、分P `cid`） |
| `get_subtitle` | read | `bvid`*、`cid` | 字幕逐行文本 |
| `get_danmaku` | read | `bvid`*、`cid`、`segment`(6 分钟一段，从 1 开始) | 视频内弹幕 |
| `danmaku_send` | **costly** | `bvid`*、`message`*(1–100 字)、`progress`*(秒)、`cid` | 向视频指定时间点发送公开弹幕（20 秒内同文案拒绝） |
| `get_comments` | read | `bvid`*、`page`、`sort`(1 热度 / 0 时间) | 一级评论 |
| `get_replies` | read | `bvid`*、`root`*、`page` | 楼中楼回复 |
| `fav_folders` | read | — | 收藏夹列表 |
| `fav_list` | read | `mediaId`*、`page`、`size` | 收藏夹内容 |
| `watch_later` | read | — | 稍后再看 |
| `watch_later_remove` | write | `aid`* | 从稍后再看移除一个视频（aid 来自 `watch_later`） |
| `play` | write | `bvid`* | 在桌面端打开并播放 |
| `stop` | write | — | 停止视频音频 |
| `comment_like` | write | `bvid`* / `oid`（二选一）、`rpid`*、`like` | 评论点赞/取消；推荐用 `bvid`，`oid`（aid）为旧调用兼容 |
| `comment_post` | **costly** | `bvid`* / `oid`（二选一）、`message`*、`root`、`parent` | 发表公开评论；推荐用 `bvid` |

### account

| action | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `list` | read | — | 已登录账号（不含 cookie） |
| `get_current` | read | — | 当前登录态与能否发送 |
| `get_wallet` | read | `roomId` | 金/银瓜子余额 |
| `switch` | write | `accountId`* | 切换活跃账号 |
| `remove` | destructive | `accountId`* | 删除本地凭据（不可逆） |

### settings

| action | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `get` | read | `keys` | 读取设置（默认剔除快捷键与外观） |
| `patch` | write | `patch`* | 局部修改，仅接受 `sendInterval`/`rateLimit`/`riskControl`/`receive`/`filter` |

### memory

房间 / 全局两级 Markdown 记忆，每个范围最多 8000 字。`watch_start` 会自动附带房间与全局记忆的摘要（房间 800 字、全局 400 字），完整内容用 `get`。

| action | 风险 | 参数 | 说明 |
| --- | --- | --- | --- |
| `get` | read | `scope`*(room/global)、`roomId` | 读取完整记忆 |
| `set` | write | `scope`*、`roomId`、`content`* | 覆盖写入（Markdown） |
| `append` | write | `scope`*、`roomId`、`content`* | 追加一段，不覆盖旧内容 |
| `list` | read | — | 全部记忆的摘要（字数、更新时间、前 80 字） |
| `delete` | destructive | `scope`*、`roomId` | 删除记忆，不可逆 |

> `roomId` 用真实房间号（`room_get` 的返回值）。

### mcp_describe

| 参数 | 说明 |
| --- | --- |
| `domain` | 域名称；省略时返回全部域与 action 索引 |
| `action` | 域内 action；省略时返回整个域的参数 schema |

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
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"live","arguments":{"action":"get_context","params":{"danmakuLimit":20}}}}'
```
