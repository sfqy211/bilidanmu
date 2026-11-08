# STT 模型下载器

> 2026-11-09 设计并实现；同日扩展为「流式 + 离线」双组目录并落地离线识别引擎。目标：设置页内一键下载识别模型，替代「手动去 GitHub 下载 → 解压 → 放目录」的流程；境内下载走镜像加速。

## 1. 背景

- sherpa-onnx 官方全部 ASR 模型统一挂在 release tag [`asr-models`](https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models) 下，URL 格式 `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/<文件名>`，asset 均为 `.tar.bz2`（VAD 单文件 `.onnx`）。
- 该 release 有 500+ asset，全量列出对用户是噪音；`api.github.com` 在大陆同样不稳，动态拉取列表不可靠 → 内置精选目录。
- 2026 年行业事实：纯流式模型线止步于 2025-06-30 的 zipformer 中文系；精度提升转向「离线大模型 + VAD 切句」架构。因此目录分**流式组**（2025 zipformer 全家福 + 含粤语的三语 Paraformer）与**离线组**（SenseVoice / FunASR-Nano 2025-12 / FireRedASR2 与 Qwen3-ASR 2026-03）。

## 1.1 离线识别引擎（2026-11-09 追加）

- `stt/pipeline.rs` 引入 `Engine::Streaming | Engine::Offline` 双引擎，模型类型经 `model.meta.json`（下载器解压后写入 `{"kind": ...}`）选择加载分支；手动放置的模型走目录内容启发式兜底。
- 离线流程：16k 重采样样本 → Silero VAD（`_vad/silero_vad_v5.onnx`，threshold 0.5 / min_silence 0.4s / max_speech 15s）切段 → `OfflineRecognizer` 整句识别 → 以句尾音频时间戳 emit（阶段 1 的对齐调度直接复用）。
- 流式侧同步支持 transducer / paraformer / CTC 三类加载分支（2025 zipformer CTC 系需要）。
- `list_stt_models` 判定放宽（任一 onnx + tokens/tokenizer/meta）；`start_stt` 对离线模型预检查 VAD 缺失并提前报错。
- **实测**（2026-11-09，真实唱歌直播间）：SenseVoice int8 158MB 经 gh-proxy 下载 ~13MB/s，VAD 自动附带，离线引擎启动，连续产出多句高质量识别（口语长句亦准确）。

## 2. 设计

### 2.1 内置精选目录（非动态接口）

Rust 侧 `commands/stt_download.rs` 的 `CATALOG` 常量只收录**当前管线可加载**的流式模型（3 个：zh-14M 轻量 / bilingual small / bilingual full），`id` = 压缩包内顶层目录名 = 安装后的模型子目录名，安装完 `list_stt_models` 直接扫到。扩展点：后续离线识别落地后向 `CATALOG` 增补离线模型即可。

### 2.2 镜像加速（已实测）

- 实测（2026-11-09，大陆网络）：直连 `github.com` release asset **连接失败**；`https://gh-proxy.com/<原URL>` 代理 asset 返回 200（含 302 跳转处理）。
- 策略：下载按序尝试 **gh-proxy 镜像 → 直连**，源连接失败/非 200 自动切换下一个；全自动，无设置项。
- 已知取舍：下载中途断流会切源从头下载（无断点续传），大文件（500MB）体验可后续用 Range 续传优化。

### 2.3 下载任务管理

- 单并发：`AppState.stt_download_job: Arc<TokioMutex<Option<DownloadJob>>>` 槽位，Some = 有任务在跑。
- 取消：oneshot 关闭通道（照抄 `AutoSenderState` 惯例），任务在每 chunk 检查点响应；解压阶段不可取消（耗时秒级，可接受）。
- 流程：临时 `.part` 文件（启动前清残留）→ 流式写盘 + 100KB 节流 emit 进度 → `spawn_blocking` 解压（tar.bz2，剥离包内顶层目录，过滤路径穿越条目）→ 校验产物（`tokens.txt` + 任一 `.onnx`）→ 失败回滚删除目录。
- 复用：`AppState.proxy_client`（统一 UA/连接池）、`get_stt_base_dir`（`commands/stt.rs`）。

### 2.4 事件与命令

- 事件 `stt-model-download`：`{ modelId, status, downloaded, total, error }`，status ∈ downloading / decompressing / done / cancelled / error。
- 命令 4 个：`list_available_stt_models` / `get_stt_model_download_status`（弹窗重开恢复）/ `start_stt_model_download` / `cancel_stt_model_download`。

### 2.5 前端

- `SpeechSettings`（AudioSettings.tsx）加「下载模型」按钮 → `SttModelDownloadDialog` 弹窗：卡片列表（描述/大小/已安装标注），进度条样式沿用 `UpdateDialog`，事件驱动状态 + 重开时 `get_stt_model_download_status` 恢复，done 回调刷新设置页模型列表；弹窗底部「官方模型页」跳转（`openUrl`）。

## 3. 验证要点

- 真实下载最小模型（zh-14M，74MB）→ 模型下拉出现 → 加载可用；
- 取消：下载中取消 → `.part` 清理、槽位清空、可重新发起；
- 重复下载已安装模型 → 报「该模型已安装」。
