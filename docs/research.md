# 调研记录

> 参考项目分析与技术调研。新功能实现前的调研结果记录于此。

---

## 一、直播流 API 调研：v2 API 与仅音频流

> 调研日期：2026-05-16
> 参考项目：PiliPlus、bilibili-API-collect、bilibili-api、simple_live_app

### 1.1 核心发现

B站直播 v2 播放 API **原生支持仅音频流**，通过 `only_audio=1` 参数请求即可。唯一完整实现此功能的参考项目是 **PiliPlus**（Dart/Flutter）。

各参考项目音频流支持情况：

| 项目 | 语言 | 音频流支持 | 说明 |
|---|---|---|---|
| **PiliPlus** | Dart/Flutter | ✅ 完整实现 | 有 UI 按钮 + API 调用 + 播放器切换 |
| **bilibili-API-collect** | 文档 | 📄 已记录 | 文档中记录了 `only_audio` 参数 |
| **bilibili-api** | Python | ❌ 未实现 | v2 方法签名中无 `only_audio` 参数 |
| **simple_live_app** | Dart/Flutter | ❌ 未实现 | 委托给 `simple_live_core`，无音频流 |

### 1.2 v2 API 端点

```
GET https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo
```

**请求参数：**

| 参数 | 类型 | 必要 | 说明 |
|---|---|---|---|
| `room_id` | num | 是 | 房间 ID |
| `protocol` | num | 否 | `0`=http_stream(FLV), `1`=http_hls(HLS)，可逗号分隔 |
| `format` | num | 否 | `0`=flv, `1`=ts, `2`=fmp4，可逗号分隔 |
| `codec` | num | 否 | `0`=AVC, `1`=HEVC，可逗号分隔 |
| `qn` | num | 否 | 画质：80/150/250/400/10000/20000/30000 |
| `platform` | str | 否 | 固定 `"web"` |
| **`only_audio`** | **num** | **否** | **默认为视频流，`1` 为仅音频流** |

**响应结构（v2）：**

```
data.playurl_info.playurl.stream[]          # 协议层: "http_stream" | "http_hls"
  .format[]                                 # 格式层: "flv" | "ts" | "fmp4"
    .codec[]                                # 编码层: "avc" | "hevc"
      .current_qn                           # 当前实际画质
      .accept_qn[]                          # 可选画质列表
      .base_url                             # 流路径（如 /live-bvc/.../live_xxx.flv?）
      .url_info[]                           # CDN 信息
        .host                               # CDN 域名
        .extra                              # URL 查询参数
```

**完整流 URL 构造：** `{host}{base_url}{extra}`

当 `only_audio=1` 时，`base_url` 指向纯音频 mux，返回的 FLV/HLS 流仅含音频轨。响应结构与视频流完全一致，仅流内容不同。

### 1.3 参考实现（PiliPlus）

PiliPlus 的完整流程：

**Step 1 — API 调用**（`lib/http/live.dart:83-109`）

```dart
static Future<LoadingState<RoomPlayInfoData>> liveRoomInfo({
  required Object roomId,
  Object? qn,
  bool onlyAudio = false,
}) async {
  final res = await Request().get(
    Api.liveRoomInfo,  // = '/xlive/web-room/v2/index/getRoomPlayInfo'
    queryParameters: await WbiSign.makSign({
      'room_id': roomId,
      'protocol': '0,1',
      'format': '0,1,2',
      'codec': '0,1',
      'qn': ?qn,
      'platform': 'web',
      'ptype': 8,
      'dolby': 5,
      'panorama': 1,
      if (onlyAudio) 'only_audio': 1,   // <-- 关键参数
      'web_location': 444.8,
    }),
  );
  ...
}
```

**Step 2 — 控制器调用**（`lib/pages/live_room/controller.dart:239-281`）

```dart
Future<void> queryLiveUrl({bool autoFullScreenFlag = false}) async {
  final res = await LiveHttp.liveRoomInfo(
    roomId: roomId,
    qn: currentQn,
    onlyAudio: plPlayerController.onlyPlayAudio.value,
  );
  if (res case Success(:final response)) {
    List<CodecItem> codec =
        response.playurlInfo!.playurl!.stream!.first.format!.first.codec!;
    CodecItem item = codec.first;
    videoUrl = VideoUtils.getLiveCdnUrl(item);
    await playerInit(...);
  }
}
```

**Step 3 — URL 构造**（`lib/utils/video_utils.dart:91-95`）

```dart
static String getLiveCdnUrl(CodecItem e) {
  return (liveCdnUrl ?? e.urlInfo!.first.host!) +
      e.baseUrl! +
      e.urlInfo!.first.extra!;
}
```

**Step 4 — 播放器视频轨切换**（`lib/plugin/pl_player/controller.dart:1681-1684`）

```dart
void setOnlyPlayAudio() {
  onlyPlayAudio.value = !onlyPlayAudio.value;
  videoPlayerController?.setVideoTrack(
    onlyPlayAudio.value ? VideoTrack.no() : VideoTrack.auto(),
  );
}
```

**Step 5 — UI 按钮**（`lib/pages/live_room/widgets/header_control.dart:178-198`）

按钮标注为「仅播放音频」，切换时同时：禁用视频渲染 + 重新请求 `only_audio=1` 流。

### 1.4 当前项目迁移路径

当前项目未实现直播流拉取功能（仅做弹幕收发）。若需添加音频流功能，需要：

| 步骤 | 文件 | 说明 |
|---|---|---|
| Rust API 层 | `src-tauri/src/bili/api.rs` | 新增 `get_room_play_info()` 函数，调用 v2 API，接受 `only_audio: bool` |
| Rust 模型层 | `src-tauri/src/models/` | 新增 v2 响应结构体（`PlayUrlInfo` → `Stream` → `Format` → `CodecItem` → `UrlInfo`） |
| Rust IPC 命令 | `src-tauri/src/commands/` | 新增 `get_audio_stream_url` 命令，返回拼接后的流 URL |
| 前端 IPC 封装 | `src/lib/tauri.ts` | 在 `tauriCommands` 中添加对应调用 |
| 前端 UI | DanmakuPage 或独立页面 | 添加音频播放控件 |

---

## 二、STT 管道技术调研：sherpa-onnx + symphonia

> 调研日期：2026-05-17
> 参考项目：sherpa-onnx 官方示例、symphonia 0.6 文档

### 2.1 核心决策

采用 **sherpa-onnx** (Rust crate `1.13`) 作为流式语音识别引擎，配合 **symphonia 0.6** 进行 AAC 解码。两者均为纯 Rust 绑定，静态链接，无 LLVM/FFI 手写需求。

### 2.2 技术选型对比

| 方案 | 语言绑定 | 静态链接 | 流式识别 | 部署复杂度 |
|---|---|---|---|---|
| **sherpa-onnx (Rust)** | 官方 crate | ✅ | ✅ OnlineRecognizer | 低（cargo add 即可） |
| whisper.cpp (C++) | 绑定 + FFI | ❌ 需编译 | ❌ 仅离线 | 高（CMake + LLVM） |
| Vosk (Python/C) | Python binding | ❌ | ✅ | 中（需 Python 运行时） |
| sherpa-onnx (Python) | Python binding | ❌ | ✅ | 中 |

### 2.3 管道架构

```
FLV 字节流 (from proxy tee)
  → FlvDemuxer: 提取 AAC 帧 + ADTS 封装 + 解析 AudioSpecificConfig
  → AacDecoder: symphonia 0.6 ADTS reader + 持久化 AudioDecoder 实例
  → extract_f32_samples: 10 种音频格式 → f32 单声道混音
  → LinearResampler: sherpa-onnx 内置，重采样至 16kHz
  → OnlineRecognizer: 流式识别 + 端点检测（2.4s/1.2s 静音 + 20s 最短语）
  → SttTranscript { text, isFinal } → Tauri event "stt-transcript"
```

### 2.4 symphonia 0.6 API 要点（与 0.5 差异）

| 特性 | symphonia 0.5 | symphonia 0.6 |
|---|---|---|
| 解码器创建 | `make_decoder()` | `make_audio_decoder(&AudioCodecParameters, &AudioDecoderOptions)` |
| 音频 buffer 类型 | `AudioBufferRef` | `GenericAudioBufferRef`（10 变体：U8/U16/U24/U32/S8/S16/S24/S32/F32/F64） |
| 通道访问 | `buf.chan(ch)` | `buf.plane(ch)` → `Option<&[S]>` |
| 通道数获取 | `.channels` 字段 | `.spec().channels().count()` 方法 |
| CodecParameters 类型 | struct | enum（`.audio()` → `Option<&AudioCodecParameters>`） |

### 2.5 安全防护

| 风险 | 防护措施 |
|---|---|
| 管道挂起（stop 无响应） | `bytes_tx: Option<Sender>`，stop 时设 `None` 关闭 channel |
| FLV 恶意大 tag | `MAX_TAG_DATA_SIZE = 65536` |
| ADTS frame_len 溢出 | `checked_add` + 8191 上限 |
| model_id 路径穿越 | 校验禁止 `..`/`/`/`\` |
| 无符号音频 DC 偏置 | U8/U16/U24/U32 中心化至 [-1, 1] |
| 通道数不一致 | 使用解码器输出通道数而非 FLV 头 |

### 2.6 当前项目实现文件

| 文件 | 说明 |
|---|---|
| `src-tauri/src/stt/pipeline.rs` | 主管道（FLV demux → AAC decode → resample → recognize） |
| `src-tauri/src/stt/flv_demux.rs` | FLV 解复用器 + ADTS 封装 + AudioSpecificConfig 解析 |
| `src-tauri/src/stt/mod.rs` | SttManager 生命周期管理（Notify 即时取消） |
| `src/hooks/useSttTranscript.ts` | 延迟缓冲 + 按需 RAF 循环（空闲自动停止） |
| `src/components/danmaku/SubtitleOverlay.tsx` | 半透明黑底白字字幕叠加 |
