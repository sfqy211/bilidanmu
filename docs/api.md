# API 与实现细节

> 关键 B 站 API、Tauri IPC 命令汇总、事件列表、核心实现代码片段。

---

## 一、关键 B 站 API

### 发送弹幕（核心）

```
POST https://api.live.bilibili.com/msg/send
Content-Type: application/x-www-form-urlencoded

参数: msg, roomid, color(16777215=白色), mode(1=滚动), fontsize(25),
      rnd(当前时间戳), csrf(bili_jct), csrf_token(bili_jct),
      dm_type(0=文字, 1=表情), emoticonOptions(JSON, 表情时需要),
      bubble(0), reply_mid(0), reply_type(0)
```

### 获取弹幕服务器信息（接收用）

```
GET https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?id={room_id}
需要 WBI 签名
```

### 获取直播间信息

```
GET https://api.live.bilibili.com/room/v1/Room/get_info?room_id={room_id}
```

### 直播流播放信息（v2）

```
GET https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo
参数: room_id, protocol, format, codec, qn, platform, only_audio
需要 WBI 签名
```

### WebSocket 弹幕流协议（接收用）

```
连接: wss://{host}:{wss_port}/sub
认证包(op=7): {uid, roomid, protover:3, platform:"web", type:2, key}
心跳包(op=2): 每30秒发送空body
数据格式: 16字节头 + 压缩body (protover 3=Brotli, 2=zlib, 0=原始JSON)
```

---

## 二、Tauri IPC 命令汇总

### 命令列表

| 命令 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `login_by_qr` | - | `{ url, qrcode_key }` | 生成二维码登录 URL |
| `poll_qr` | `qrcode_key` | `QrPollResult` | 轮询扫码结果 |
| `login_by_cookie` | `cookie` | `Credential` | Cookie 登录 |
| `check_login_status` | - | `LoginStatus` | 检查登录状态 |
| `restore_login` | - | `Credential \| null` | 恢复已保存的登录 |
| `logout` | - | void | 登出并清除凭据 |
| `search_room` | `query, mode` | `SearchRoomResult[]` | 搜索直播间 |
| `add_room` | `room_id` | `RoomInfo` | 添加直播间 |
| `remove_room` | `room_id` | void | 移除直播间 |
| `get_room_info` | `room_id` | `RoomInfo` | 直播间详情 |
| `get_danmu_info` | `room_id` | 弹幕服务器信息 | 获取弹幕服务器信息 |
| `get_rooms` | - | `Room[]` | 获取已添加房间列表 |
| `get_emoticons` | `room_id` | `EmoticonPackage[]` | 获取表情列表 |
| `open_danmaku_window` | `room_id` | void | 打开弹幕子窗口 |
| `send_danmaku` | `room_id, msg, color?, mode?` | `BiliResponse` | 发送文字弹幕 |
| `send_emoticon` | `room_id, emoticon_unique, emoticon_options?` | `BiliResponse` | 发送表情弹幕 |
| `start_loop_send` | `room_id, messages[], interval_ms` | void | 开始循环发送（最小 300ms） |
| `stop_loop_send` | - | void | 停止循环发送 |
| `connect_danmaku_stream` | `room_id` | void | 连接弹幕流 |
| `disconnect_danmaku_stream` | - | void | 断开弹幕流 |
| `add_ai_model` | `input: AIModelInput` | `AIModel` | 添加模型 |
| `get_ai_models` | - | `AIModel[]` | 获取所有模型 |
| `test_ai_connection` | `input: AIModelInput` | `TestResult` | 测试连接 |
| `fetch_models` | `endpoint, api_key` | `string[]` | 获取可用模型 |
| `set_current_model` | `id` | void | 切换当前模型 |
| `update_ai_model` | `id, input: AIModelInput` | `AIModel` | 更新模型 |
| `delete_ai_model` | `id` | void | 删除模型 |
| `proxy_image` | `url` | `string`（data URI） | 代理图片（SSRF 白名单 + 5MB 限制） |
| `get_settings` | - | `Settings` | 获取设置 |
| `update_settings` | `settings` | void | 更新设置 |
| `load_selections` | `keys: string[]` | `Record<string, unknown>` | 批量读取选择项 |
| `save_selections` | `entries: Record<string, unknown>` | void | 批量保存选择项（事务） |

> **计划中但未实现的命令：** `export_config`、`import_config`、`remove_account`

---

## 三、事件列表（Rust → 前端）

| 事件名 | Payload | 说明 |
|---|---|---|
| `danmaku-received` | `DanmakuMessage` | 收到弹幕 |
| `gift-received` | `GiftMessage` | 收到礼物 |
| `sc-received` | `SuperChatMessage` | 收到醒目留言 |
| `danmaku-sent` | `{ msg, success }` | 弹幕发送结果 |
| `danmaku-muted` | `{ remain_sec }` | 被禁言 |
| `danmaku-error` | `{ code, message }` | 弹幕流错误 |
| `ws-connected` | `{ room_id }` | 弹幕流已连接 |
| `ws-disconnected` | `{ reason }` | 弹幕流断开 |
| `ws-heartbeat` | `{ popularity }` | 心跳/人气值 |
| `loop-send-tick` | `{ roomId, message, index }` | 循环发送成功 |
| `loop-send-error` | `{ roomId, message, index, error }` | 循环发送失败 |
| `loop-send-stopped` | `{ reason }` | 循环发送停止 |

---

## 四、关键实现细节

### 4.1 WBI 签名（Rust，参考 PiliPlus/astrbot）

```rust
const MIXIN_KEY_ENC_TAB: [usize; 64] = [
    46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,
    27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,
    37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,
    22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52,
];

fn get_mixin_key(orig: &str) -> String {
    MIXIN_KEY_ENC_TAB.iter().take(32).map(|&i| orig.chars().nth(i).unwrap()).collect()
}

pub fn sign_wbi(params: &mut Vec<(&str, String)>, img_key: &str, sub_key: &str) {
    let mixin_key = get_mixin_key(&format!("{}{}", img_key, sub_key));
    let wts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    params.push(("wts", wts.to_string()));
    params.sort_by(|a, b| a.0.cmp(b.0));
    let query: String = params.iter().map(|(k, v)| format!("{}={}", k, v)).collect::<Vec<_>>().join("&");
    let digest = md5::compute(format!("{}{}", query, mixin_key));
    params.push(("w_rid", format!("{:x}", digest)));
}
```

### 4.2 弹幕发送（Rust，参考 BLSPAM/PiliPlus）

```rust
pub async fn send_danmaku(client: &reqwest::Client, room_id: u64, msg: &str, credential: &Credential, color: u32, mode: u32, dm_type: u32) -> Result<BiliResponse> {
    let rnd = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs().to_string();
    let form = [("bubble","0"),("msg",msg),("color",&color.to_string()),("mode",&mode.to_string()),("room_type","0"),("jumpfrom","0"),("reply_mid","0"),("reply_attr","0"),("reply_type","0"),("fontsize","25"),("rnd",&rnd),("roomid",&room_id.to_string()),("csrf",&credential.bili_jct),("csrf_token",&credential.bili_jct),("dm_type",&dm_type.to_string())];
    let resp = client.post("https://api.live.bilibili.com/msg/send").form(&form).header("Cookie", credential.cookie_header()).send().await?;
    Ok(resp.json().await?)
}
```

### 4.3 WebSocket 二进制协议（Rust，参考 astrbot/bilibili-api）

```rust
/// 16 字节包头（大端序）:
/// [0..4] pack_len:u32  [4..6] header_size:u16  [6..8] protover:u16
/// [8..12] operation:u32  [12..16] sequence:u32

pub const HEADER_SIZE: usize = 16;
pub const OP_HEARTBEAT: u32 = 2;
pub const OP_AUTH: u32 = 7;

impl PacketHeader {
    pub fn from_bytes(data: &[u8]) -> Self { /* 大端序解析 */ }
    pub fn auth_packet(room_id: u64, uid: u64, key: &str) -> Vec<u8> { /* op=7 构造 */ }
    pub fn heartbeat_packet() -> Vec<u8> { /* op=2 构造 */ }
}
```

### 4.4 前端 Tauri IPC 封装

```typescript
// src/lib/tauri.ts
export const tauriCommands = {
  auth: {
    loginByQr: () => invoke<QrLoginResult>("login_by_qr"),
    pollQr: (qrcodeKey: string) => invoke<QrPollResult>("poll_qr", { qrcodeKey }),
    loginByCookie: (cookie: string) => invoke<Credential>("login_by_cookie", { cookie }),
    checkLoginStatus: () => invoke<LoginStatus>("check_login_status"),
    restoreLogin: () => invoke<Credential | null>("restore_login"),
    logout: () => invoke<void>("logout"),
  },
  danmaku: {
    send: (roomId: number, msg: string, opts?: SendOptions) =>
      invoke<BiliResponse>("send_danmaku", { roomId, msg, ...opts }),
    sendEmoticon: (roomId: number, emoticonUnique: string, opts?: SendEmoticonOptions) =>
      invoke<BiliResponse>("send_emoticon", { roomId, emoticonUnique, ...opts }),
    startLoop: (roomId: number, messages: string[], intervalMs: number) =>
      invoke<void>("start_loop_send", { roomId, messages, intervalMs }),
    stopLoop: () => invoke<void>("stop_loop_send"),
  },
  room: {
    search: (query: string, mode: SearchRoomMode) =>
      invoke<SearchRoomResult[]>("search_room", { query, mode }),
    add: (roomId: number) => invoke<RoomInfo>("add_room", { roomId }),
    remove: (roomId: number) => invoke<void>("remove_room", { roomId }),
    getInfo: (roomId: number) => invoke<RoomInfo>("get_room_info", { roomId }),
    getEmoticons: (roomId: number) =>
      invoke<EmoticonPackage[]>("get_emoticons", { roomId }),
    openDanmaku: (roomId: number) => invoke<void>("open_danmaku_window", { roomId }),
  },
  ws: {
    connect: (roomId: number) => invoke<void>("connect_danmaku_stream", { roomId }),
    disconnect: () => invoke<void>("disconnect_danmaku_stream"),
  },
  ai: {
    addModel: (input: AIModelInput) => invoke<AIModel>("add_ai_model", { input }),
    getModels: () => invoke<AIModel[]>("get_ai_models"),
    testConnection: (input: AIModelInput) => invoke<TestResult>("test_ai_connection", { input }),
    fetchModels: (endpoint: string, apiKey: string) =>
      invoke<string[]>("fetch_models", { endpoint, apiKey }),
    setCurrentModel: (id: string) => invoke<void>("set_current_model", { id }),
    updateModel: (id: string, input: AIModelInput) =>
      invoke<AIModel>("update_ai_model", { id, input }),
    deleteModel: (id: string) => invoke<void>("delete_ai_model", { id }),
  },
  settings: {
    get: () => invoke<Settings>("get_settings"),
    update: (settings: Settings) => invoke<void>("update_settings", { settings }),
  },
  state: {
    getRooms: () => invoke<Room[]>("get_rooms"),
  },
  selections: {
    load: (keys: string[]) => invoke<Record<string, unknown>>("load_selections", { keys }),
    save: (entries: Record<string, unknown>) => invoke<void>("save_selections", { entries }),
  },
  proxy: {
    image: (url: string) => invoke<string>("proxy_image", { url }),
  },
};
```

### 4.5 速率限制器（Rust，参考 BLSPAM）

```rust
pub struct RateLimiter { min_interval_ms: u64, max_interval_ms: u64, window_limit: usize, window_secs: u64, send_timestamps: Vec<u64> }

impl RateLimiter {
    pub async fn wait_for_permit(&mut self) {
        // 滑动窗口检查 → 随机间隔 (1.5-3s) → 记录时间戳
    }
}
```
