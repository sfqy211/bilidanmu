# B 站 API

BiliDanmu 对接了 B 站的多个公开 API 与私有 API，本章列出核心接口。

> **注意**：B 站 API 可能随时变更，本文档基于开发时的实现整理。

## API 分类

| 类别 | 说明 |
| --- | --- |
| 房间 API | 房间信息、直播状态、直播流地址 |
| 弹幕 API | 发送弹幕、弹幕配置 |
| 账号 API | 账号信息、登录状态 |
| 搜索 API | 主播搜索、房间搜索 |
| 互动 API | 点赞、分享 |

## 房间 API

### 获取房间信息

```
GET https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo
```

| 参数 | 说明 |
| --- | --- |
| `room_id` | 房间号 |
| `protocol` | 协议（0: http_stream, 1: http_hls） |
| `format` | 格式（0: flv, 1: ts, 2: fmp4） |
| `codec` | 编码（0: avc, 1: hevc） |
| `qn` | 画质 |
| `platform` | 平台（web） |
| `ptype` | 播放类型 |
| `dolby` | 杜比 |
| `panorama` | 全景 |

### 获取直播流地址

返回直播流 URL 列表，包含 CDN 信息与画质选项。

## 弹幕 API

### 发送弹幕

```
POST https://api.live.bilibili.com/msg/send
```

| 参数 | 说明 |
| --- | --- |
| `bubble` | 弹幕池 |
| `msg` | 弹幕内容 |
| `color` | 颜色（十进制 RGB） |
| `mode` | 模式（1: 滚动, 4: 底部, 5: 顶部） |
| `fontsize` | 字号 |
| `roomid` | 房间号 |
| `csrf` | bili_jct |
| `rnd` | 时间戳 |

> **提示**：发送弹幕需要登录态（Cookie 中的 SESSDATA 与 bili_jct）。

## 账号 API

### 获取账号信息

```
GET https://api.bilibili.com/x/web-interface/nav
```

返回当前登录账号的基本信息，包括 UID、昵称、头像、VIP 状态等。

## 搜索 API

### 搜索主播

```
GET https://api.bilibili.com/x/web-interface/search/type
```

| 参数 | 说明 |
| --- | --- |
| `search_type` | 搜索类型（live_user） |
| `keyword` | 关键词 |
| `page` | 页码 |

## WBI 签名

部分 API 需要 WBI 签名，流程如下：

1. 获取 `wbi_img`（`img_key` 与 `sub_key`）
2. 对参数按 key 排序
3. 拼接字符串 + `wts`（时间戳）
4. 计算 `w_rid`（MD5）

BiliDanmu 在 `src-tauri/src/bili/wbi/` 中实现了完整的 WBI 签名逻辑。

## 错误码

| 码 | 说明 |
| --- | --- |
| 0 | 成功 |
| -101 | 未登录 |
| -400 | 请求错误 |
| 19002003 | 房间不存在 |
