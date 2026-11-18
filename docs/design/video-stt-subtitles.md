# 视频语音转字幕（听视频模式）

> 2026-11-19 设计并实现。目标：视频没有 CC 字幕时，用本地 STT 生成一份和 CC 一样可浏览、可跳转的完整字幕；有 CC 的视频不提供该入口。

## 1. 需求与边界

- 视频页（`/listen/video/:bvid`）有官方 CC 字幕时，**不提供语音识别入口**。
- 没有 CC（或 CC 接口读取失败）时，用户手动点击才开始识别。
- 生成结果按普通字幕列表展示：自动跟随、点击跳行，不是直播弹幕窗那种底部浮动叠加层。
- 切换视频 / 分 P 立即取消正在进行的识别，不在后台继续跑。
- 结果**只保留在当前会话**（进程内），重启即清空。
- 视频弹幕独立窗口（`video-danmaku`）的字幕时间轴共用同一份结果，并可在窗口内发起识别。

## 2. 关键决策：整段批量识别，不复用直播实时管线

直播 STT 是「代理 tee FLV 字节 → 实时识别」，视频不能直接复用：

| 维度 | 直播实时 | 视频整段 |
| --- | --- | --- |
| 容器 | FLV + ADTS AAC | DASH 的 fMP4/m4s |
| 拖动进度 | 只认识已播放过的音频，seek 后时间轴断裂 | 完整轨道，任意跳转 |
| 结果形态 | 流式 partial + 叠加层 | 带绝对时间戳的完整字幕行 |
| 质量 | 流式模型常无标点 | 离线模型（SenseVoice 等）带标点/ITN |
| 缓存 | 无 | 会话内按 `bvid:cid` 复用 |

因此视频走独立管线：下载整段音轨 → MP4 解复用 → AAC 解码 → 16k 单声道 → VAD 切句 → 逐句识别 → 每句 emit + 追加到列表。

## 3. 实现

### 3.1 后端

- `src-tauri/src/stt/video_stt.rs`
  - `download_audio`：用 `state.proxy_client` 下载 CDN 音轨到 `app_cache_dir()/video-stt/{bvid}-{cid}.m4s`，支持取消与字节进度；结束/取消/出错都会删临时文件。
  - `recognize_mp4`：`symphonia` 0.6 + `isomp4`（支持 fMP4 的 `moof`/`mdat`/`sidx`）解复用，按音频轨参数创建 AAC 解码器，复用 `pipeline::extract_f32_samples` 取 16k mono。
  - VAD 切句：`pipeline::create_batch_vad`（max 7s / silence 0.35s，比直播的 15s 更接近字幕行）；`SpeechSegment::start()` 给出绝对样本号，时间戳精确。
  - 识别器：`pipeline::BatchRecognizer` 复用现有模型解析与在线/离线引擎；每个 VAD 片段独立送入，避免直播流式会话状态。
  - **兜底**：流式模型下载包不一定带 `_vad`。VAD 缺失且模型是流式时，改用 `BatchStreamingSession` 按 endpoint 切句，句首按最长 8 秒回推（近似时间戳）。
  - 长句再切分：超过 42 字符按句末标点/逗号切成最多 3 行，时间按字符数比例分配。
- `src-tauri/src/commands/video_stt.rs`
  - `get_video_stt` / `start_video_stt` / `stop_video_stt` / `clear_video_stt`。
  - 单任务：`AppState.video_stt_job` 只保留一个任务，开始新任务会先取消旧的。
  - 会话缓存：`AppState.video_stt_cache: HashMap<bvid:cid, VideoSttTrack>`，不落库。
  - 进度/增量通过 `video-stt` 事件推送（`downloading` / `decoding` / `recognizing` / `done` / `cancelled` / `error`）。
- 模型目录、WBI 音轨解析、发送账号均复用现有命令（`get_model_dir`、`get_video_audio_url`）。

### 3.2 前端

- `src/hooks/useVideoStt.ts`：加载会话缓存、订阅 `video-stt`、`start/stop/restart`；effect 依赖 `bvid/cid/enabled`，清理时立即 `stop_video_stt`。
- `src/hooks/useSttModelReady.ts`：检查当前 `settings.stt.modelId` 是否已安装。
- 视频页：CC 状态增加 `checked` 字段，`sttAllowed = checked && 无 CC`；有 CC 时 hook 不启用，也只显示 CC。
- `SubtitlePanel` 增加空态主操作、进度文案、`AI 生成` 徽标、停止/重新识别；列表本身不变。
- 视频弹幕窗：`VideoTimelinePane` 空态/错误态支持操作按钮与状态文案；CC 为空时回退到 `get_video_stt` + 事件增量。

## 4. 易错点

- **不能有 CC 时仍允许识别**：CC 检查完成（`checked`）之前一律禁用，避免首页几帧闪出 STT 入口。
- **取消事件竞态**：重新识别时旧任务的 `cancelled` 可能晚到；hook 在新任务已开始时忽略该事件。
- **进度事件与行事件混排**：带 `line` 的事件不更新进度，否则每行都会把进度归零。
- **临时文件泄漏**：下载/识别任一路径结束都要删 `.m4s`。
- **两个窗口同时订阅**：视频页与弹幕窗各持一份列表；识别由谁发起都行，缓存统一在 Rust 侧。
- **不做 settings 字段**：这是每个视频的手动行为，不新增嵌套设置，避免 `mergeSettings` 二级合并坑。

## 5. 验证记录

- `symphonia` 0.6 的 `isomp4` feature 在 0.6.1 下依赖 `symphonia-format-isomp4 0.6.1`（本地 USTC 镜像索引需刷新后可见）。
- 用 ffmpeg 生成 `frag_keyframe+empty_moov+default_base_moof` 的 fMP4，喂入本机已安装的流式 zipformer + Silero VAD：
  - 解复用/解码/VAD/识别全部通过；
  - 8.6s 音频输出 4 行，时间戳 0.13–7.94s，与语音位置吻合。
- `cargo check`、`npm run typecheck` 通过。
