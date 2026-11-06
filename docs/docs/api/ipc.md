# IPC 命令

前端通过 Tauri 的 `invoke` 调用后端命令。本章按前端命名空间列出全部已注册命令。

> **提示**：所有命令已封装在 `src/lib/tauri.ts` 的 `tauriCommands` 对象中，请通过该对象调用，而非直接使用 `invoke`。Rust 侧命令在 `src-tauri/src/lib.rs` 的 `generate_handler!` 中统一注册。

## 调用方式

```typescript
import { tauriCommands } from '@/lib/tauri'

const rooms = await tauriCommands.room.getRoomsLiveStatus()
const settings = await tauriCommands.settings.get()
```

参数名在 TS 侧用 camelCase，Tauri 会自动映射到 Rust 的 snake_case 形参。

## 账号命令 (`auth`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `login_by_tv_qr` | — | `{ url, authCode }` | 获取 TV 二维码登录 URL |
| `poll_tv_qr` | `authCode` | `QrPollResult & { accessKey? }` | 轮询 TV 二维码登录状态 |
| `login_by_qr` | — | `serde_json::Value` | 网页版二维码（界面未使用） |
| `poll_qr` | `qrcodeKey` | `serde_json::Value` | 网页版二维码轮询（界面未使用） |
| `login_by_cookie` | `cookie` | `Credential` | 直接用 Cookie 导入账号（界面未使用） |
| `restore_login` | — | `Credential \| null` | 恢复上次登录 |
| `remove_account` | `accountId` | `string \| null` | 移除账号，返回新的活跃账号 id |
| `switch_account` | `accountId` | `Credential` | 切换主账号 |
| `switch_sending_account` | `accountId` | `Credential` | 切换发送账号 |
| `get_sending_account_id` | — | `string \| null` | 获取发送账号 id |
| `list_accounts` | — | `Credential[]` | 列出所有账号 |
| `switch_to_anonymous` | — | `Credential` | 切换到匿名模式 |
| `refresh_account_info` | `accountId` | `Credential` | 刷新头像/昵称等元信息 |
| `refresh_cookie` | `accountId` | `Credential` | 续期 Cookie |

## 房间命令 (`room`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `search_room` | `query, mode` | `SearchRoomResult[]` | `mode` = `name` / `roomId` / `link` / `uid` |
| `add_room` | `roomId` | `RoomInfo` | 添加房间并落库 |
| `remove_room` | `roomId` | `void` | 移除房间 |
| `get_room_info` | `roomId` | `RoomInfo` | 获取房间信息 |
| `get_rooms` | — | `Room[]` | 获取房间列表（`state` 命名空间也封装了一份） |
| `get_live_time` | `roomId` | `number \| null` | 获取开播时间戳 |
| `reorder_rooms` | `roomIds` | `void` | 拖拽排序（按完整显示顺序重排） |
| `get_follow_lives` | — | `SearchRoomResult[]` | 关注列表中正在直播的主播（需登录） |
| `get_rooms_live_status` | — | `Record<uid, { isLive, title, liveStartTime }>` | 批量开播状态，**按 UID 键控** |
| `open_danmaku_window` | `roomId` | `void` | 打开弹幕窗（位置尺寸由后端恢复），隐藏主窗口并通知 `danmaku-entered` |
| `switch_room` | `roomId` | `void` | 原地切换直播间，emit `room-switched`，不改变窗口可见性 |
| `exit_room` | `roomId` | `void` | 退出直播间：断开连接、销毁弹幕窗、恢复主窗口 |
| `get_emoticons` | `roomId, force?, accountId?` | `EmoticonPackage[]` | 获取表情列表 |
| `clear_emoticon_cache` | — | `void` | 清除全部表情缓存 |
| `clear_room_emoticon_cache` | `roomId` | `void` | 清除指定房间的表情缓存 |
| `clear_room_specific_emoticons` | — | `void` | 清除房间专属表情 |
| `get_favorite_emoticons` | `accountId` | `Emoticon[]` | 获取收藏表情 |
| `add_favorite_emoticon` | `accountId, emoticon` | `void` | 添加收藏表情 |
| `remove_favorite_emoticon` | `accountId, emoticonUnique` | `void` | 移除收藏表情 |
| `update_favorite_order` | `accountId, emoticonUnique, sortOrder` | `void` | 更新收藏排序 |
| `get_audio_stream_url` | `roomId` | `StreamInfo` | 获取直播音频流（含本地代理 URL） |
| `clear_audio_stream` | — | `void` | 清除直播音频流槽位 |
| `get_danmaku_input_only` | — | `boolean` | 弹幕窗是否处于仅输入框模式 |
| `set_danmaku_input_only` | `enabled` | `boolean` | 进出仅输入框模式（Rust 侧改尺寸/位置） |
| `set_danmaku_input_only_emotes` | `open` | `boolean` | 紧凑模式下临时展开/收起表情面板 |
| `sample_background_luminance` | — | `number \| null` | 采样弹幕窗背后屏幕平均亮度 0.0–1.0 |
| `is_mock_enabled` | — | `boolean` | 是否启用了虚拟直播间 |

## 弹幕命令 (`danmaku`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `send_danmaku` | `roomId, msg, color?, mode?, dmType?` | `BiliResponse` | 发送文字弹幕 |
| `send_emoticon` | `roomId, emoticonUnique, emoticonOptions?, color?, mode?, dmType?` | `BiliResponse` | 发送表情弹幕 |
| `send_like` | `roomId, anchorId, clickTime` | `BiliResponse` | 发送点赞 |
| `start_auto_send` | `roomId, entries, intervalMs, timeLimitSecs?` | `void` | 开始循环发送；`entries` 为 `{ message, dmType, emoticonOptions? }[]` |
| `stop_auto_send` | — | `void` | 停止循环发送 |
| `start_auto_like` | `roomId, anchorId, targetTotal, batchSize, intervalMs` | `void` | 开始自动点赞 |
| `stop_auto_like` | — | `void` | 停止自动点赞 |

## 礼物命令 (`gift`)

全部受 cargo feature `gift-send` 门控；未启用时一律返回错误。

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `gift_send_enabled` | — | `boolean` | 当前构建是否启用礼物打赏 |
| `get_room_gifts` | `roomId` | `GiftConfig[]` | 房间礼物面板列表 |
| `get_gift_bag` | `roomId` | `GiftBagItem[]` | 我的礼物背包 |
| `get_gift_wallet` | `roomId` | `WalletInfo` | 金瓜子 / 银瓜子余额 |
| `send_gift` | `roomId, ruid, giftId, giftNum, bagId?, coinType?, price?` | `BiliResponse` | 发送礼物（`bagId > 0` 走背包不扣费） |

虚拟直播间（房间号 0）下这四条数据命令返回固定 fixture，绝不触网。

## WebSocket 命令 (`ws`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `connect_danmaku_stream` | `roomId` | `void` | 连接弹幕流（虚拟房间号 0 连本地 mock） |
| `disconnect_danmaku_stream` | — | `void` | 断开弹幕流 |

## 视频命令 (`video`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `get_video_info` | `bvid` | `VideoInfo` | 视频信息（标题、UP 主、分 P、合集） |
| `get_video_audio` | `bvid, cid` | `AudioStreamInfo` | 解析 DASH 音轨并注册本地代理（Range/206） |
| `stop_video_audio` | — | `void` | 停止视频音频代理 |
| `list_fav_folders` | — | `FavFolder[]` | 我创建的收藏夹（需登录） |
| `list_fav_resources` | `mediaId, page?, size?` | `FavResourcePage` | 收藏夹内视频（分页） |
| `list_watch_later` | — | `WatchLaterItem[]` | 稍后再看（需登录） |
| `search_videos` | `keyword, page?` | `SearchVideoPage` | 视频关键词搜索 |
| `get_video_subtitle` | `bvid, cid` | `SubtitleLine[]` | 视频自带字幕 |
| `get_video_comments` | `aid, page?, sort?` | `CommentPage` | 评论列表（`sort` 1=按点赞 2=按时间） |
| `get_comment_replies` | `oid, root, page?` | `CommentPage` | 楼中楼回复 |
| `like_comment` | `oid, rpid, like` | `void` | 评论点赞/取消 |
| `add_video_comment` | `oid, message, root?, parent?` | `VideoComment` | 发表评论或回复 |

## 设置命令 (`settings`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `get_settings` | — | `Settings` | 获取设置 |
| `update_settings` | `settings` | `void` | 保存设置（同时同步 `dock_enabled`、主题跟随等内存镜像） |
| `is_stt_available` | — | `boolean` | STT 是否可用（当前恒为 `true`） |
| `get_shortcut_errors` | — | `string[]` | 最近一次全局快捷键注册失败清单 |

## 状态命令 (`state`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `get_rooms` | — | `Room[]` | 获取房间列表 |

## 选项持久化 (`selections`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `load_selections` | `keys` | `Record<string, unknown>` | 批量加载选项（不存在的键返回 `null`） |
| `save_selections` | `entries` | `void` | 批量保存选项 |

## Dock 命令 (`dock`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `dock_expand` | `label` | `void` | 展开（带动画，先发 `expanded` 再由前端触发 apply） |
| `dock_apply_expand` | `label` | `void` | 实际应用展开几何 |
| `dock_collapse` | `label` | `void` | 收起 |
| `dock_exit` | `label` | `void` | 退出吸附态，恢复自由窗口 |
| `get_dock_state` | `label` | `{ phase, side? }` | 当前吸附状态；`phase` = `normal` / `collapsed` / `expanded` / `collapsing`，`side` = `left` / `right` / `top` |

## 隐身命令 (`stealth`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `set_danmaku_stealth` | `enabled` | `boolean` | 开关弹幕窗隐身模式 |
| `get_danmaku_stealth` | — | `{ enabled, visible }` | 查询隐身状态 |

## 代理命令 (`proxy`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `proxy_image` | `url, persistent?` | `string` | 返回 base64 data URL |
| `clear_image_cache` | — | `void` | 清除封面与头像缓存（保留荣耀等级图标与表情图） |
| `get_cache_stats` | — | `{ imageSize, imageCount, emoticonPkgCount, emoticonCount, emoticonImageSize }` | 缓存统计 |

## STT 命令 (`stt`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `start_stt` | — | `void` | 开始语音识别 |
| `stop_stt` | — | `void` | 停止语音识别 |
| `switch_stt_model` | `modelId` | `void` | 切换模型 |
| `get_stt_model_dir` | — | `string` | 模型目录路径 |
| `list_stt_models` | — | `string[]` | 列出可用模型目录 |
| `open_stt_model_dir` | — | `void` | 在文件管理器中打开模型目录 |

## 快捷消息命令 (`messageTemplate`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `list_message_templates` | — | `MessageTemplate[]` | 列出模板 |
| `create_message_template` | `title, content` | `i64` | 创建模板，返回新 id |
| `update_message_template` | `id, title, content` | `void` | 更新模板 |
| `delete_message_template` | `id` | `void` | 删除模板 |

## 更新与文件命令 (`update`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `check_update` | — | `UpdateInfo` | 检查 GitHub 最新 release |
| `download_file` | `url, filename` | `string` | 下载安装包，返回保存路径 |
| `open_file_path` | `path` | `void` | 用系统默认程序打开文件 |

## 日志命令 (`log`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `open_log_dir` | — | `void` | 打开日志目录 |

## 应用命令 (`app`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `quit_app_cmd` | — | `void` | 停止自动任务、断开连接、保存几何后退出 |

## AI 命令 (`ai`)

「AI 接入」页使用的管理命令。外部 AI 客户端走的是本地 MCP 通道
（见 [MCP 工具参考](./mcp)），两条路最终都进同一个调度入口
`ai::dispatch::call_tool`，因此权限与审计对两者一致。

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `ai_list_tools` | — | `ToolSpec[]` | 全部工具规格（名称/标题/描述/风险/参数 schema） |
| `ai_call_tool` | `name, args?` | `ToolResult` | 从调试面板调用工具，受权限模式约束并记入审计 |
| `ai_get_permission_mode` | — | `"confirmAll" \| "autonomous" \| "full"` | 当前权限模式 |
| `ai_set_permission_mode` | `mode` | `void` | 切换权限模式，广播 `ai-permission-changed` |
| `ai_confirm_response` | `id, approved` | `boolean` | 回应确认请求；返回 false 表示该请求已超时失效 |
| `ai_mcp_status` | — | `McpStatus` | MCP 服务状态（`running`/`port`/`endpoint`/`error`） |
| `ai_mcp_start` | — | `McpStatus` | 启动 MCP 服务 |
| `ai_mcp_stop` | — | `McpStatus` | 停止 MCP 服务 |
| `ai_mcp_token` | — | `string` | 读取访问 token |
| `ai_mcp_regenerate_token` | — | `string` | 重新生成 token，旧 token 立即失效 |
| `ai_audit_list` | `limit?` | `AuditEntry[]` | 最近工具调用记录（默认 50，最大 500） |
| `ai_audit_clear` | — | `void` | 清空调用记录 |

`ToolResult` 形状：`{ ok, data?, error?, truncated?, cursor? }`，其中
`error` 为 `{ code, message, hint?, retryable, confirmationId? }`。

