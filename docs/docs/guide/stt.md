# 语音转字幕（STT）

BiliDanmu 内置基于 **sherpa-onnx** 的流式语音识别功能，可将直播音频实时转为字幕。

## 技术原理

```mermaid
flowchart LR
    A["直播音频流 (FLV)"] --> B["FLV 解复用"]
    B --> C["AAC 解码<br/>(symphonia 0.6)"]
    C --> D["重采样<br/>(LinearResampler)"]
    D --> E["sherpa-onnx<br/>流式识别"]
    E --> F["字幕叠加层显示"]
```

## 使用方式

1. 进入「设置 → 直播音频」，在「实时字幕」中点击「打开目录」，或用「刷新模型」确认已安装的模型。
2. 若有需要，先将识别模型放入独立子文件夹，包含 encoder、decoder、joiner 的 ONNX 文件及 `tokens.txt`。
3. 在「识别模型」下拉框选择模型，开启「启用语音识别」。
4. 进入直播间并播放直播音频，识别出的字幕会叠加在弹幕窗口底部。

字幕会按播放进度自动对齐（识别时间轴锚定到播放器进度上，暂停时字幕随之冻结）。一般无需手动调整；如实测仍有固定偏移，可微调「字幕同步偏移」：负值提前，正值延迟，步进 100ms，范围 −2000…+2000。

## 功能特点

- **本地推理**：基于 sherpa-onnx 2.0，无需联网，保护隐私
- **流式识别**：实时识别，低延迟
- **字幕叠加**：字幕以叠加层形式显示在弹幕窗口，静音时淡出
- **播放对齐**：字幕按播放进度自动对齐，重连后自动重新锚定
- **模型切换**：可列出模型目录下的多个子文件夹并切换
- **同步微调**：自动对齐之外仍可微调字幕同步偏移
- **按需开启**：可在设置中随时开启 / 关闭；STT 始终编译进程序，没有单独的精简构建

## 识别流程

```mermaid
sequenceDiagram
    participant FLV as 直播流
    participant Demux as FLV 解复用
    participant Decode as AAC 解码
    participant Resample as 重采样
    participant STT as sherpa-onnx
    participant UI as 字幕叠加层

    FLV->>Demux: AAC 帧
    Demux->>Decode: ADTS 封装
    Decode->>Resample: PCM 采样
    Resample->>STT: 标准采样率
    STT->>UI: stt-transcript 事件
```

识别管道跑在 `spawn_blocking` 线程里，不占用 tokio 运行时；字幕通过 `stt-transcript` 事件推送到前端，事件自带音频流内时间戳，前端按播放进度调度显示——识别快慢不再影响字幕与声音的对齐。

## 性能提示

- 语音识别会占用一定的 CPU 资源
- 如遇到性能问题，可尝试关闭其他占用 CPU 的应用
- 建议在较新的设备上启用此功能

## 常见问题

**Q：字幕和声音对不上？**

A：字幕按播放进度自动对齐；如仍有固定偏移，可用「字幕同步偏移」微调（负值提前、正值延迟）。识别速度慢于播放速度时字幕会滞后跟上，属正常现象。

**Q：识别准确率不高？**

A：准确率受音频质量、背景噪音等因素影响，建议在安静环境下使用，或切换更大型号。

**Q：虚拟直播间能用吗？**

A：不能。`npm run dev:mock` 的虚拟房间没有真实音频流，音频播放与 STT 都不可用（预期行为）。
