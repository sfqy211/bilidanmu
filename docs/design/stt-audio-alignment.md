# STT 字幕与音频播放对齐（阶段 1）

> 2026-11-09 设计并实现。目标：根治「字幕内容超前于正在播放的音频」的问题，不动识别模型本身。

## 1. 根因

直播音频 FLV 流经本地代理 tee 点后**同一份字节**分给两条线：

- 播放线：mpegts.js（`enableStashBuffer: false` 低延迟配置）→ MSE → `<audio>` 播出，存在播放缓冲延迟；
- 识别线：FLV 解复用 → AAC 解码 → 16k 重采样 → sherpa-onnx 流式识别 → 字节到达即出字，**不等播放器**。

字幕显示用的是「收到事件的本地墙钟 + 手调偏移（`syncDelayMs`）」，与播放进度无任何参照，因此字幕内容天然超前于耳朵听到的声音约一个缓冲延迟；网络抖动/播放器缓冲变化时漂移，手调治标不治本。

## 2. 方案：音频流内时间戳 + 播放进度调度

识别继续快跑，**显示由播放进度决定**。

### 2.1 时间戳（Rust）

- 管线解码出的 16kHz 样本在 `accept_waveform` 前累计（`audio_samples`），换算为流内音频时刻 `audioTsMs = audio_samples * 1000 / 16000`；
- `SttTranscript` 新增字段：
  - `audioTsMs: i64` — 该条文本对应的音频流内时刻（epoch 内相对时间）；
  - `epoch: u64` — 时间轴世代，pipeline 启动为 1。
- 世代重置：tee 新连接建立（mpegts.js 重连、切流）时，proxy 在新连接上先发一条 `PipelineMessage::ResetStream`，管线收到后 `epoch += 1`、样本计数归零、清 demuxer/解码器缓冲并 reset 识别器。旧连接已入队的残余字节在 Reset 前被处理，顺序天然正确。
- 已知瞬态偏差：AAC 解码失败丢弃的样本不计入时间轴（播放器 currentTime 照常推进），表现为字幕轻微滞后，量级 ≤ 丢帧时长，不补偿。

### 2.2 锚点校准（前端）

识别轴与播放轴起点可以差任意固定偏移（STT 中途启动、播放器起播缓冲），用**一对锚点**粘合：

```
锚点 = (首条 transcript 的 audioTsMs, 当时的 audio.currentTime)
有效音频时刻 effectiveMs = currentTime + (锚点audioTsMs − 锚点currentTime)
```

前提是两条轴速率一致（直播流实时率 1.0，均成立）。校准自动吸收 STT 晚启动、播放器起播延迟等所有固定偏移。epoch 变化时清空状态、用新 epoch 首条重新锚定。

### 2.3 显示调度（useSttTranscript 重写）

- 调度时钟 = `audio.currentTime`（而非墙钟）：暂停时字幕冻结，恢复自然继续，无需任何特殊处理；
- 单句 + 小队列模型：句（partial 链）首条 ts 为显示锚点，`final` 带 `endTs`；
  - `effectiveMs + LEAD_MS ≥ 句锚点` → 开始显示（LEAD_MS = 250ms，抵消锚点以「已喂入终点」计的滞后）；
  - `final` 后 `effectiveMs ≥ endTs + HOLD_MS` → 淡出清除（HOLD_MS = 1200ms，FADE_OUT_MS = 800ms 复用现有过渡）；
  - final 之后到来的 partial/final 视为新句入队；
  - pending 队列上限 4 句，溢出丢最旧——识别积压时宁丢字幕不堆积延迟；
- `syncDelayMs` 语义降级为微调项（加在 effective 上），默认 0，自动对齐后一般无需调整。

## 3. 改动清单

| 层 | 文件 | 内容 |
|---|---|---|
| Rust | `stt/mod.rs` | `SttTranscript` 加 `audio_ts_ms` / `epoch` |
| Rust | `stt/pipeline.rs` | `PipelineMessage` 枚举（Bytes/ResetStream）、样本累计、epoch、4 处 emit 带时间戳 |
| Rust | `stt/flv_demux.rs` | `FlvDemuxer::reset()`（新连接重置解析状态） |
| Rust | `proxy/stream_proxy.rs` | tee 通道类型改 `PipelineMessage`，新连接发 `ResetStream` |
| 前端 | `types/bilibili.ts` | `SttTranscript` 加 `audioTsMs` / `epoch` |
| 前端 | `hooks/useSttTranscript.ts` | 锚点校准 + 句队列调度，移除墙钟打点 |
| 前端 | `pages/DanmakuPage.tsx` | 传入 `getCurrentTime` 回调（audioRef） |
| 前端 | `components/settings/AudioSettings.tsx` | 同步偏移文案改为微调语义 |
| 文档 | `docs/docs/api/events.md` | `stt-transcript` payload 字段 |
| 文档 | `docs/docs/guide/stt.md` | 同步偏移与工作原理描述 |

## 4. 已知限制（阶段 1 不处理）

- 长时间暂停后恢复：识别轴已超前，pending 句按 1.0 速率逐句补播（滞后但不丢，超 4 句丢弃）；追帧播放器配置是阶段外事项；
- 两条轴长期速率漂移（理论极小）不做自动重锚，实测再定；
- 端到端验证需要真实直播房（mock 虚拟房不含音频流），静态验证靠 `cargo check` + `typecheck`。
