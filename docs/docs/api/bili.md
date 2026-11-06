# B 站 API

BiliDanmu 对接了 B 站的多个公开与私有接口，本章按用途列出实际使用的端点。

> **注意**：B 站 API 可能随时变更，本文档基于当前代码实现整理。协议细节优先查本地参考项目 `D:\AHEU\code\reference\bilibili-API-collect-main`。

## API 分类

| 类别 | 说明 |
| --- | --- |
| 房间 API | 房间信息、开播状态、直播流地址、开播时间 |
| 弹幕 API | 弹幕配置、发送弹幕、点赞 |
| 账号 API | 账号信息、登录状态、关注列表 |
| 搜索 API | 主播搜索、视频搜索 |
| 视频 API | 视频信息、音轨、字幕、评论、收藏夹、稍后再看 |
| 礼物 API | 礼物面板、背包、余额、发送（gift-send 构建） |

## 房间与直播流

| 用途 | 端点 |
| --- | --- |
| 房间信息 | `GET https://api.live.bilibili.com/room/v1/Room/get_info?room_id=` |
| 按 UID 查房间 / 批量开播状态 | `GET https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids?uids[]=` |
| 弹幕服务器配置 | `GET https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?id=`（返回 token 与 host_list） |
| 直播流（音频） | `GET https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo`（WBI 签名 + `only_audio=1`） |
| 开播时间 | 同 `getRoomPlayInfo`，读 `live_time` |
| 高能榜前 3 | `GET .../xlive/general-interface/v1/rank/getOnlineGoldRank?roomId=&ruid=&page=1&pageSize=3` |
| 观看心跳 | `GET https://live-trace.bilibili.com/xlive/rdata-interface/v1/heartbeat/webHeartBeat` |

`getRoomPlayInfo` 的常用参数：

| 参数 | 说明 |
| --- | --- |
| `room_id` | 房间号 |
| `protocol` | `0` = http_stream，`1` = http_hls |
| `format` | `0` = flv，`1` = ts，`2` = fmp4 |
| `codec` | `0` = avc，`1` = hevc |
| `qn` | 画质 |
| `platform` | `web` |
| `ptype` | 播放类型 |
| `dolby` / `panorama` | 杜比 / 全景 |

本项目只取音频编码与纯 A 协议流，用于纯音频播放。

## 弹幕

| 用途 | 端点 |
| --- | --- |
| 发送弹幕 | `POST https://api.live.bilibili.com/msg/send` |
| 点赞上报 | `POST https://api.live.bilibili.com/xlive/app-ucenter/v1/like_info_v3/like/likeReportV3` |
| 表情包 | `GET https://api.live.bilibili.com/xlive/web-ucenter/v2/emoticon/GetEmoticons` |

发送弹幕参数：

| 参数 | 说明 |
| --- | --- |
| `msg` | 弹幕内容 |
| `color` | 颜色（十进制 RGB） |
| `mode` | 模式（1 滚动 / 4 底部 / 5 顶部） |
| `fontsize` | 字号（默认 25） |
| `roomid` | 房间号 |
| `csrf` | `bili_jct` |
| `rnd` | 时间戳 |

> 发送需要登录态（SESSDATA + bili_jct）。

## 账号

| 用途 | 端点 |
| --- | --- |
| 账号信息 | `GET https://api.bilibili.com/x/web-interface/nav` |
| 关注列表 | `GET https://api.live.bilibili.com/xlive/web-ucenter/user/following` |

## 搜索

| 用途 | 端点 |
| --- | --- |
| 主播 / 直播间搜索 | `GET https://api.bilibili.com/x/web-interface/search/type`（`search_type=live_user`） |
| 视频搜索 | 同上（`search_type=video`） |

## 视频与评论

| 用途 | 端点 |
| --- | --- |
| 视频信息 | `GET https://api.bilibili.com/x/web-interface/view?bvid=` |
| 音轨地址 | `GET https://api.bilibili.com/x/player/wbi/playurl`（需 WBI） |
| 字幕 | `GET https://api.bilibili.com/x/player/wbi/v2`（需 WBI，返回 `subtitle.subtitles`） |
| 评论列表 | `GET https://api.bilibili.com/x/v2/reply` |
| 楼中楼 | `GET https://api.bilibili.com/x/v2/reply/reply` |
| 评论点赞 | `POST https://api.bilibili.com/x/v2/reply/action` |
| 发表评论 | `POST https://api.bilibili.com/x/v2/reply/add` |
| 稍后再看 | `GET https://api.bilibili.com/x/v2/history/toview/web` |
| 我创建的收藏夹 | `GET https://api.bilibili.com/x/v3/fav/folder/created/list-all` |
| 收藏夹内容 | `GET https://api.bilibili.com/x/v3/fav/resource/list` |

## 礼物（gift-send 构建）

| 用途 | 端点 | 说明 |
| --- | --- | --- |
| 礼物面板 | `GET /xlive/web-room/v1/giftPanel/roomGiftList?platform=pc&room_id=` | **`platform` 必须是 `pc`**，传 `web` 时 `gift_config` 为 null |
| 背包 | `GET /xlive/web-room/v1/gift/bag_list?t=&room_id=` | `room_id` 必须是真实房间号，空背包返回 `null` |
| 瓜子余额 | `GET /xlive/web-room/v1/index/getInfoByUser?room_id=` | 读 `data.wallet.{gold,silver}` |
| 发送（背包） | `POST /xlive/revenue/v2/gift/sendBagMultiUser` | 走背包库存不扣费 |
| 发送（金瓜子） | `POST /xlive/revenue/v2/gift/sendGoldMultiUser` | **真实扣费** |
| 发送（银瓜子） | `POST /xlive/revenue/v2/gift/sendSilverMultiUser` | 辣条等免费礼物 |

v2 送礼端点约束：

- 参数全部在 **query** 上（POST 无 body），`Content-Type` 仍为 `application/x-www-form-urlencoded`
- Header 需要 `Referer: https://live.bilibili.com/{room_id}` 与 `Origin: https://live.bilibili.com`
- `receive_users` 必须是 JSON 数组 `[{"uid": <ruid>}]`
- 认证只靠 Cookie（SESSDATA + bili_jct 双 csrf 字段），不签 WBI
- 响应非 JSON（风控页）时报「请求被拦截，可能触发风控」；`-101` 提示重新登录

## WBI 签名

部分接口（`x/player/wbi/playurl`、`x/player/wbi/v2` 等）需要 WBI 签名：

1. `GET https://api.bilibili.com/x/web-interface/nav` 拿到 `wbi_img.img_url` / `sub_url`
2. 从 URL 文件名中去掉扩展名，得到 `img_key` / `sub_key`
3. 按 `MIXIN_KEY_ENC_TAB` 取前 32 位拼出 `mixin_key`
4. 参数按 key 字典序排序，加上 `wts` 时间戳
5. 计算 `w_rid = md5(query + mixin_key)`

实现见 `src-tauri/src/bili/wbi.rs`，密钥带缓存。

## WebSocket 弹幕协议

16 字节大端序包头：

| 偏移 | 长度 | 字段 |
| --- | --- | --- |
| 0 | 4 | 包长度 |
| 4 | 2 | 包头长度（16） |
| 6 | 2 | 协议版本（0/1/2/3） |
| 8 | 4 | 操作码 |
| 12 | 4 | 序列号 |

操作码：`2` 心跳、`3` 心跳回复、`5` 业务消息、`7` 认证、`8` 认证回复。

已解析的消息类型：`DANMU_MSG*`、`SEND_GIFT`、`SEND_GIFT_V2`（protobuf）、`INTERACT_WORD`、`INTERACT_WORD_V2`、`SUPER_CHAT_MESSAGE`、`SUPER_CHAT_MESSAGE_JPN`、`GUARD_BUY`、`LIVE`、`PREPARING*`、`LIKE_INFO_V3_CLICK`、`STOP_LIVE_ROOM_LIST`（仅用于判定本房间是否下播）。

## 错误码

| 码 | 说明 |
| --- | --- |
| 0 | 成功 |
| -101 | 未登录 |
| -400 | 请求错误 |
| -403 | 无权限 / 触发风控 |
| -352 / -412 | 风控拦截 |
| 19002003 | 房间不存在 |
