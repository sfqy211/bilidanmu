# IPC 命令

前端通过 Tauri 的 `invoke` 调用后端命令。本章列出所有可用的 IPC 命令。

> **提示**：所有命令已封装在 `src/lib/tauri.ts` 的 `tauriCommands` 对象中，请通过该对象调用，而非直接使用 `invoke`。

## 调用方式

```typescript
import { tauriCommands } from '@/lib/tauri.ts'

const rooms = await tauriCommands.room.search('test', 'name')
```

## 账号命令 (`auth::*`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `login_by_tv_qr` | — | `{ url, authCode }` | 获取 TV 二维码登录 URL |
| `poll_tv_qr` | `authCode` | `QrPollResult` | 轮询 TV 二维码登录状态 |
| `restore_login` | — | `Credential \| null` | 恢复上次登录 |
| `remove_account` | `accountId` | `string \| null` | 移除账号 |
| `switch_account` | `accountId` | `Credential` | 切换主账号 |
| `switch_sending_account` | `accountId` | `Credential` | 切换发送账号 |
| `get_sending_account_id` | — | `string \| null` | 获取发送账号 ID |
| `list_accounts` | — | `Credential[]` | 列出所有账号 |
| `switch_to_anonymous` | — | `Credential` | 切换到匿名账号 |
| `refresh_account_info` | `accountId` | `Credential` | 刷新账号信息 |
| `refresh_cookie` | `accountId` | `Credential` | 刷新 Cookie |

## 房间命令 (`room::*`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `search_room` | `query, mode` | `SearchRoomResult[]` | 搜索房间 |
| `add_room` | `roomId` | `RoomInfo` | 添加房间 |
| `remove_room` | `roomId` | `void` | 移除房间 |
| `get_room_info` | `roomId` | `RoomInfo` | 获取房间信息 |
| `open_danmaku_window` | `roomId, width?, height?` | `void` | 打开弹幕窗口 |
| `open_drawer_window` | `roomId, panel` | `void` | 打开抽屉窗口 |
| `exit_room` | `roomId` | `void` | 退出房间 |
| `get_emoticons` | `roomId, force?, accountId?` | `EmoticonPackage[]` | 获取表情列表 |
| `clear_emoticon_cache` | — | `void` | 清除表情缓存 |
| `clear_room_emoticon_cache` | `roomId` | `void` | 清除房间表情缓存 |
| `clear_room_specific_emoticons` | — | `void` | 清除房间特定表情 |
| `get_favorite_emoticons` | `accountId` | `Emoticon[]` | 获取收藏表情 |
| `add_favorite_emoticon` | `accountId, emoticon` | `void` | 添加收藏表情 |
| `remove_favorite_emoticon` | `accountId, emoticonUnique` | `void` | 移除收藏表情 |
| `update_favorite_order` | `accountId, emoticonUnique, sortOrder` | `void` | 更新收藏排序 |
| `get_audio_stream_url` | `roomId` | `StreamInfo` | 获取音频流地址 |
| `clear_audio_stream` | — | `void` | 清除音频流 |
| `get_rooms_live_status` | — | `Record<string, boolean>` | 获取房间开播状态 |
| `get_live_time` | `roomId` | `number \| null` | 获取直播时间 |

## 弹幕命令 (`danmaku::*`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `send_danmaku` | `roomId, msg, options?` | `BiliResponse` | 发送弹幕 |
| `send_emoticon` | `roomId, emoticonUnique, options?` | `BiliResponse` | 发送表情弹幕 |
| `send_like` | `roomId, anchorId, clickTime` | `BiliResponse` | 发送点赞 |
| `start_auto_send` | `roomId, entries, intervalMs, timeLimitSecs?` | `void` | 开始自动发送 |
| `stop_auto_send` | — | `void` | 停止自动发送 |
| `start_auto_like` | `roomId, anchorId, targetTotal, batchSize, intervalMs` | `void` | 开始自动点赞 |
| `stop_auto_like` | — | `void` | 停止自动点赞 |

## WebSocket 命令 (`ws::*`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `connect_danmaku_stream` | `roomId` | `void` | 连接弹幕流 |
| `disconnect_danmaku_stream` | — | `void` | 断开弹幕流 |

## AI 命令 (`ai::*`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `configure_astrbot` | `host, httpPort, callbackPort` | `void` | 配置 AstrBot |
| `get_astrbot_config` | — | `AstrbotConfig \| null` | 获取配置 |
| `switch_astrbot_room` | `roomId, callbackUrl?, uname?, title?` | `void` | 切换房间 |
| `disconnect_astrbot` | — | `void` | 断开连接 |
| `trigger_astrbot` | `action, context` | `string[]` | 触发 AI |
| `learn_astrbot` | `chosen, options` | `void` | 学习 |
| `get_astrbot_status` | — | `Record<string, unknown>` | 获取状态 |
| `get_callback_port` | — | `number` | 获取回调端口 |
| `get_ai_summaries` | — | `AiSuggestion[]` | 获取 AI 总结 |
| `clear_ai_summaries` | — | `void` | 清除总结 |

## 设置命令 (`settings::*`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `get_settings` | — | `Settings` | 获取设置 |
| `update_settings` | `settings` | `void` | 更新设置 |
| `is_stt_available` | — | `boolean` | STT 是否可用 |
| `is_ai_available` | — | `boolean` | AI 是否可用 |

## 状态命令 (`state::*`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `get_rooms` | — | `Room[]` | 获取房间列表 |

## 选项持久化 (`selections::*`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `load_selections` | `keys` | `Record<string, unknown>` | 加载选项 |
| `save_selections` | `entries` | `void` | 保存选项 |

## Dock 命令 (`dock::*`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `dock_expand` | `label` | `void` | 展开窗口 |
| `dock_apply_expand` | `label` | `void` | 应用展开 |
| `dock_collapse` | `label` | `void` | 折叠窗口 |
| `dock_exit` | `label` | `void` | 退出窗口 |
| `get_dock_state` | `label` | `string` | 获取 Dock 状态 |

## 代理命令 (`proxy::*`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `proxy_image` | `url, persistent?` | `string` | 代理图片 |
| `clear_image_cache` | — | `void` | 清除图片缓存 |
| `get_cache_stats` | — | `CacheStats` | 获取缓存统计 |

## STT 命令 (`stt::*`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `start_stt` | — | `void` | 开始语音识别 |
| `stop_stt` | — | `void` | 停止语音识别 |
| `switch_stt_model` | `modelId` | `void` | 切换模型 |
| `get_stt_model_dir` | — | `string` | 获取模型目录 |
| `list_stt_models` | — | `string[]` | 列出模型 |
| `open_stt_model_dir` | — | `void` | 打开模型目录 |

## 消息模板命令 (`messageTemplate::*`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `list_message_templates` | — | `MessageTemplate[]` | 列出模板 |
| `create_message_template` | `title, content` | `i64` | 创建模板 |
| `update_message_template` | `id, title, content` | `void` | 更新模板 |
| `delete_message_template` | `id` | `void` | 删除模板 |

## 更新命令 (`update::*`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `check_update` | — | `UpdateInfo` | 检查更新 |
| `download_file` | `url, filename` | `string` | 下载文件 |
| `open_file_path` | `path` | `void` | 打开文件 |

## 日志命令 (`log::*`)

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `open_log_dir` | — | `void` | 打开日志目录 |
