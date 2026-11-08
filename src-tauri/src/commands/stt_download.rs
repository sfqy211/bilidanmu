//! STT 模型下载器：从 sherpa-onnx 官方 release（`asr-models` tag）下载精选
//! 识别模型，经 gh-proxy 镜像加速（失败自动回退直连），解压放置到模型目录。
//!
//! 目录分两组：
//! - 流式（streaming）：边说边出字，低延迟；含 2025 zipformer 中文全家福、
//!   多语种、流式 Paraformer（唯一含粤语）。类型 transducer/paraformer/ctc。
//! - 离线（offline）：VAD 切句 + 整句识别，延迟 3-5s 但精度显著更高；
//!   含 SenseVoice、FunASR-Nano（2025-12）与 FireRedASR2 / Qwen3-ASR（2026）。
//!   离线模型下载时自动附带 Silero VAD（`_vad/silero_vad_v5.onnx`）。
//!
//! 解压成功后写入 `model.meta.json`（模型类型标记），识别管线据此选择
//! 加载分支与引擎模式。

use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{oneshot, Mutex as TokioMutex};

use super::stt::get_stt_base_dir;
use crate::AppState;

/// 官方 release 的 tag（全部 ASR 模型 asset 统一挂在该 tag 下）
const ASR_MODEL_TAG: &str = "asr-models";
const RELEASE_BASE: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download";
/// 大陆访问加速镜像（已实测可代理 release asset，含 302 跳转）
const MIRROR_PREFIX: &str = "https://gh-proxy.com/";

/// 离线识别依赖的 Silero VAD（模型目录下的固定位置与文件名）
pub const VAD_DIR: &str = "_vad";
pub const VAD_FILE: &str = "silero_vad_v5.onnx";

/// 进度事件节流间隔（字节）
const PROGRESS_THROTTLE: u64 = 100 * 1024;

/// 精选模型目录条目。
///
/// `id` 即压缩包内顶层目录名，也是放置后的模型子目录名，
/// 下载完成后 `list_stt_models` 可直接扫描到。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SttCatalogEntry {
    pub id: &'static str,
    /// release asset 文件名（.tar.bz2）
    pub filename: &'static str,
    /// asset 大小（字节，取自官方 release 元数据）
    pub size_bytes: u64,
    pub description: &'static str,
    /// streaming | offline（前端分组展示）
    pub group: &'static str,
    /// transducer | paraformer | ctc | sensevoice | firered | qwen3
    pub kind: &'static str,
}

const CATALOG: &[SttCatalogEntry] = &[
    // ── 流式组（2025 zipformer 中文系列为主）──────────────────────────
    SttCatalogEntry {
        id: "sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30",
        filename: "sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30.tar.bz2",
        size_bytes: 132_672_143,
        description: "流式 · 中文 2025 标准版（推荐日常使用）",
        group: "streaming",
        kind: "transducer",
    },
    SttCatalogEntry {
        id: "sherpa-onnx-streaming-zipformer-zh-xlarge-int8-2025-06-30",
        filename: "sherpa-onnx-streaming-zipformer-zh-xlarge-int8-2025-06-30.tar.bz2",
        size_bytes: 597_847_101,
        description: "流式 · 中文 2025 加大杯（同代精度最高）",
        group: "streaming",
        kind: "transducer",
    },
    SttCatalogEntry {
        id: "sherpa-onnx-streaming-zipformer-ctc-zh-int8-2025-06-30",
        filename: "sherpa-onnx-streaming-zipformer-ctc-zh-int8-2025-06-30.tar.bz2",
        size_bytes: 128_013_864,
        description: "流式 · 中文 2025 CTC 版",
        group: "streaming",
        kind: "ctc",
    },
    SttCatalogEntry {
        id: "sherpa-onnx-streaming-zipformer-ctc-zh-xlarge-int8-2025-06-30",
        filename: "sherpa-onnx-streaming-zipformer-ctc-zh-xlarge-int8-2025-06-30.tar.bz2",
        size_bytes: 590_187_481,
        description: "流式 · 中文 2025 CTC 加大杯",
        group: "streaming",
        kind: "ctc",
    },
    SttCatalogEntry {
        id: "sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01",
        filename: "sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01.tar.bz2",
        size_bytes: 21_284_637,
        description: "流式 · 中文 2025 CTC 超轻量（低配设备）",
        group: "streaming",
        kind: "ctc",
    },
    SttCatalogEntry {
        id: "sherpa-onnx-streaming-zipformer-ar_en_id_ja_ru_th_vi_zh-2025-02-10",
        filename: "sherpa-onnx-streaming-zipformer-ar_en_id_ja_ru_th_vi_zh-2025-02-10.tar.bz2",
        size_bytes: 259_055_639,
        description: "流式 · 多语种 2025（中英日韩泰越俄阿 8 语）",
        group: "streaming",
        kind: "transducer",
    },
    SttCatalogEntry {
        id: "sherpa-onnx-streaming-zipformer-en-kroko-2025-08-06",
        filename: "sherpa-onnx-streaming-zipformer-en-kroko-2025-08-06.tar.bz2",
        size_bytes: 57_255_881,
        description: "流式 · 英文 2025",
        group: "streaming",
        kind: "transducer",
    },
    SttCatalogEntry {
        id: "sherpa-onnx-streaming-paraformer-trilingual-zh-cantonese-en",
        filename: "sherpa-onnx-streaming-paraformer-trilingual-zh-cantonese-en.tar.bz2",
        size_bytes: 1_047_671_211,
        description: "流式 · 中英粤三语（唯一含粤语的流式模型）",
        group: "streaming",
        kind: "paraformer",
    },
    // ── 离线组（VAD 切句 + 整句识别，精度显著更高，延迟 3-5s）──────────
    SttCatalogEntry {
        id: "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09",
        filename: "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2",
        size_bytes: 165_789_286,
        description: "离线 · 中英日韩粤 2025（速度极快，推荐）",
        group: "offline",
        kind: "sensevoice",
    },
    SttCatalogEntry {
        id: "sherpa-onnx-sense-voice-funasr-nano-int8-2025-12-17",
        filename: "sherpa-onnx-sense-voice-funasr-nano-int8-2025-12-17.tar.bz2",
        size_bytes: 187_695_104,
        description: "离线 · FunASR Nano 2025-12（同架构新一代）",
        group: "offline",
        kind: "sensevoice",
    },
    SttCatalogEntry {
        id: "sherpa-onnx-fire-red-asr2-zh_en-int8-2026-02-26",
        filename: "sherpa-onnx-fire-red-asr2-zh_en-int8-2026-02-26.tar.bz2",
        size_bytes: 838_476_930,
        description: "离线 · FireRedASR2 2026-02（中英，精度第一梯队）",
        group: "offline",
        kind: "firered",
    },
    SttCatalogEntry {
        id: "sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25",
        filename: "sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25.tar.bz2",
        size_bytes: 878_602_240,
        description: "离线 · Qwen3-ASR 2026-03（最新最准，较吃 CPU）",
        group: "offline",
        kind: "qwen3",
    },
];

/// 正在进行的下载任务（单并发：槽位 Some = 有任务在跑）
pub struct DownloadJob {
    pub model_id: String,
    /// 关闭此通道即请求取消下载（发送后置 None）
    pub cancel: Option<oneshot::Sender<()>>,
}

/// `stt-model-download` 事件载荷
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadEvent {
    model_id: String,
    /// downloading | decompressing | done | cancelled | error
    status: &'static str,
    downloaded: u64,
    total: u64,
    error: Option<String>,
}

fn emit_event(
    app: &AppHandle,
    model_id: &str,
    status: &'static str,
    downloaded: u64,
    total: u64,
    error: Option<String>,
) {
    let _ = app.emit(
        "stt-model-download",
        DownloadEvent {
            model_id: model_id.to_string(),
            status,
            downloaded,
            total,
            error,
        },
    );
}

/// 下载任务结束后的槽位清理：仅当槽位仍是本任务时置空（防止误清新任务）
async fn clear_job_slot(app: &AppHandle, model_id: &str) {
    let slot = app.state::<AppState>().stt_download_job.clone();
    let mut guard = slot.lock().await;
    if let Some(job) = guard.as_ref() {
        if job.model_id == model_id {
            *guard = None;
        }
    }
}

#[tauri::command]
pub fn list_available_stt_models() -> Vec<SttCatalogEntry> {
    CATALOG.to_vec()
}

/// 查询当前下载任务（弹窗重开后恢复状态用；进度由事件补齐）
#[tauri::command]
pub async fn get_stt_model_download_status(
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    Ok(state
        .stt_download_job
        .lock()
        .await
        .as_ref()
        .map(|j| j.model_id.clone()))
}

#[tauri::command]
pub async fn start_stt_model_download(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: String,
) -> Result<(), String> {
    let entry = CATALOG
        .iter()
        .find(|e| e.id == model_id)
        .ok_or_else(|| format!("未知模型: {model_id}"))?
        .clone();

    let mut slot = state.stt_download_job.lock().await;
    if let Some(job) = slot.as_ref() {
        return Err(format!("已有模型下载任务进行中（{}）", job.model_id));
    }
    let base = get_stt_base_dir(&app)?;
    let dest = base.join(entry.id);
    if dest.join("tokens.txt").exists() || dest.join("model.meta.json").exists() {
        return Err("该模型已安装".to_string());
    }
    let (cancel_tx, cancel_rx) = oneshot::channel();
    *slot = Some(DownloadJob {
        model_id: entry.id.to_string(),
        cancel: Some(cancel_tx),
    });
    drop(slot);

    let client = state.proxy_client.clone();
    tauri::async_runtime::spawn(async move {
        run_download(app, client, entry, cancel_rx).await;
    });
    Ok(())
}

#[tauri::command]
pub async fn cancel_stt_model_download(
    state: State<'_, AppState>,
    model_id: String,
) -> Result<(), String> {
    let mut guard = state.stt_download_job.lock().await;
    if let Some(job) = guard.as_mut() {
        if job.model_id == model_id {
            if let Some(tx) = job.cancel.take() {
                let _ = tx.send(());
            }
        }
    }
    Ok(())
}

/// 完整下载流程：离线组先附带上 Silero VAD → 双源回退下载 → 解压 →
/// 写 meta.json → 校验落盘。任何终点都会清理槽位并发出对应事件。
async fn run_download(
    app: AppHandle,
    client: reqwest::Client,
    entry: SttCatalogEntry,
    mut cancel_rx: oneshot::Receiver<()>,
) {
    let part = std::env::temp_dir().join(format!("{}.part", entry.filename));
    let _ = std::fs::remove_file(&part); // 清理上次中断残留

    let base = match get_stt_base_dir(&app) {
        Ok(b) => b,
        Err(e) => {
            emit_event(&app, entry.id, "error", 0, entry.size_bytes, Some(e));
            clear_job_slot(&app, entry.id).await;
            return;
        }
    };

    emit_event(&app, entry.id, "downloading", 0, entry.size_bytes, None);
    let mut last_err = String::new();

    // 离线组依赖 Silero VAD：缺失时先附带下载（2.2MB，秒级）
    if entry.group == "offline" {
        let vad_dest = base.join(VAD_DIR).join(VAD_FILE);
        if !vad_dest.exists() {
            let vad_url = format!("{RELEASE_BASE}/{ASR_MODEL_TAG}/{VAD_FILE}");
            let vad_part = std::env::temp_dir().join(format!("{VAD_FILE}.part"));
            let _ = std::fs::remove_file(&vad_part);
            let urls = [format!("{MIRROR_PREFIX}{vad_url}"), vad_url];
            let mut vad_ok = false;
            for url in &urls {
                match download_to_file(&client, url, &vad_part, &mut cancel_rx, None).await {
                    Ok(()) => {
                        if let Err(e) = std::fs::create_dir_all(base.join(VAD_DIR))
                            .and_then(|_| std::fs::rename(&vad_part, &vad_dest))
                        {
                            last_err = format!("VAD 安装失败: {e}");
                        } else {
                            vad_ok = true;
                        }
                        break;
                    }
                    Err(DownloadOutcome::Cancelled) => {
                        let _ = std::fs::remove_file(&vad_part);
                        emit_event(&app, entry.id, "cancelled", 0, entry.size_bytes, None);
                        clear_job_slot(&app, entry.id).await;
                        return;
                    }
                    Err(DownloadOutcome::Failed(e)) => {
                        log::warn!("VAD download failed from {url}: {e}");
                        last_err = e;
                    }
                }
            }
            if !vad_ok {
                emit_event(
                    &app,
                    entry.id,
                    "error",
                    0,
                    entry.size_bytes,
                    Some(format!("下载离线识别依赖（VAD）失败：{last_err}")),
                );
                clear_job_slot(&app, entry.id).await;
                return;
            }
            log::info!("STT VAD model installed: {vad_dest:?}");
        }
    }

    let asset_url = format!("{RELEASE_BASE}/{ASR_MODEL_TAG}/{}", entry.filename);
    let urls = [format!("{MIRROR_PREFIX}{asset_url}"), asset_url];
    let mut downloaded = false;

    for url in &urls {
        match download_to_file(
            &client,
            url,
            &part,
            &mut cancel_rx,
            Some(ProgressCtx { app: &app, model_id: entry.id, total: entry.size_bytes }),
        )
        .await
        {
            Ok(()) => {
                downloaded = true;
                break;
            }
            Err(DownloadOutcome::Cancelled) => {
                let _ = std::fs::remove_file(&part);
                log::info!("STT model download cancelled: {}", entry.id);
                emit_event(&app, entry.id, "cancelled", 0, entry.size_bytes, None);
                clear_job_slot(&app, entry.id).await;
                return;
            }
            Err(DownloadOutcome::Failed(e)) => {
                log::warn!("STT model download failed from {url}: {e}");
                last_err = e;
            }
        }
    }

    if !downloaded {
        let _ = std::fs::remove_file(&part);
        emit_event(
            &app,
            entry.id,
            "error",
            0,
            entry.size_bytes,
            Some(format!("下载失败（已尝试镜像与直连）：{last_err}")),
        );
        clear_job_slot(&app, entry.id).await;
        return;
    }

    emit_event(
        &app,
        entry.id,
        "decompressing",
        entry.size_bytes,
        entry.size_bytes,
        None,
    );

    let dest = base.join(entry.id);
    let part_clone = part.clone();
    let dest_clone = dest.clone();
    let kind = entry.kind.to_string();
    let extract_result =
        tauri::async_runtime::spawn_blocking(move || {
            let r = extract_tar_bz2(&part_clone, &dest_clone);
            if r.is_ok() {
                // 写入模型类型标记，供识别管线选择加载分支与引擎模式
                let meta = serde_json::json!({ "kind": kind });
                let _ = std::fs::write(
                    dest_clone.join("model.meta.json"),
                    serde_json::to_string(&meta).unwrap_or_default(),
                );
            }
            r
        })
        .await;

    let _ = std::fs::remove_file(&part);
    let extract_result = match extract_result {
        Ok(r) => r,
        Err(e) => Err(format!("解压任务失败: {e}")),
    };

    match extract_result {
        Ok(()) => {
            // 校验产物：任一 onnx + (tokens.txt 或 tokenizer 文件)
            let valid = std::fs::read_dir(&dest).map_or(false, |entries| {
                let mut has_onnx = false;
                let mut has_tokens = false;
                for e in entries.filter_map(|e| e.ok()) {
                    let name = e.file_name().to_string_lossy().to_lowercase();
                    if name.ends_with(".onnx") {
                        has_onnx = true;
                    }
                    if name == "tokens.txt" || name.starts_with("tokenizer") {
                        has_tokens = true;
                    }
                }
                has_onnx && has_tokens
            });
            if valid {
                log::info!("STT model installed: {}", entry.id);
                emit_event(&app, entry.id, "done", entry.size_bytes, entry.size_bytes, None);
            } else {
                let _ = std::fs::remove_dir_all(&dest);
                emit_event(
                    &app,
                    entry.id,
                    "error",
                    entry.size_bytes,
                    entry.size_bytes,
                    Some("解压后未找到模型文件（onnx/tokens），已回滚".to_string()),
                );
            }
        }
        Err(e) => {
            let _ = std::fs::remove_dir_all(&dest);
            emit_event(&app, entry.id, "error", entry.size_bytes, entry.size_bytes, Some(e));
        }
    }

    clear_job_slot(&app, entry.id).await;
}

enum DownloadOutcome {
    Cancelled,
    Failed(String),
}

/// 进度上报上下文（None = 静默下载，如附带的 VAD）
struct ProgressCtx<'a> {
    app: &'a AppHandle,
    model_id: &'a str,
    total: u64,
}

/// 单源流式下载到目标文件（调用方决定目标路径）。
async fn download_to_file(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    cancel_rx: &mut oneshot::Receiver<()>,
    progress: Option<ProgressCtx<'_>>,
) -> Result<(), DownloadOutcome> {
    let resp = client
        .get(url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| DownloadOutcome::Failed(format!("{e}")))?;

    let mut file = std::fs::File::create(dest)
        .map_err(|e| DownloadOutcome::Failed(format!("创建临时文件失败: {e}")))?;
    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;

    loop {
        tokio::select! {
            biased;
            _ = &mut *cancel_rx => return Err(DownloadOutcome::Cancelled),
            chunk = stream.next() => {
                let bytes = match chunk {
                    Some(Ok(b)) => b,
                    Some(Err(e)) => return Err(DownloadOutcome::Failed(format!("下载中断: {e}"))),
                    None => break,
                };
                use std::io::Write;
                if let Err(e) = file.write_all(&bytes) {
                    return Err(DownloadOutcome::Failed(format!("写入临时文件失败: {e}")));
                }
                downloaded += bytes.len() as u64;
                if let Some(ctx) = &progress {
                    if downloaded - last_emit >= PROGRESS_THROTTLE {
                        last_emit = downloaded;
                        emit_event(ctx.app, ctx.model_id, "downloading", downloaded, ctx.total, None);
                    }
                }
            }
        }
    }

    if let Err(e) = file.sync_all() {
        return Err(DownloadOutcome::Failed(format!("刷盘失败: {e}")));
    }
    Ok(())
}

/// 解压 tar.bz2 到 `dest_dir`：剥离压缩包内顶层目录，
/// 拒绝包含路径穿越（`..`/绝对路径）的条目。
fn extract_tar_bz2(archive_path: &Path, dest_dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dest_dir)
        .map_err(|e| format!("创建模型目录失败: {e}"))?;

    let bz = bzip2::read::BzDecoder::new(
        std::fs::File::open(archive_path).map_err(|e| format!("打开压缩包失败: {e}"))?,
    );
    let mut archive = tar::Archive::new(bz);
    let entries = archive
        .entries()
        .map_err(|e| format!("读取压缩包失败: {e}"))?;

    for entry in entries {
        let mut entry = entry.map_err(|e| format!("读取条目失败: {e}"))?;
        let path = entry
            .path()
            .map_err(|e| format!("读取条目路径失败: {e}"))?
            .into_owned();

        // 剥离顶层目录（包内统一为 <model_id>/ 前缀）。
        // 注意：部分打包工具的条目带 "./" 前缀（如 ./<model_id>/x），须先滤掉
        // CurDir 再剥第一个真实目录，否则会多出一层嵌套导致校验失败。
        let comps: Vec<Component> = path
            .components()
            .filter(|c| !matches!(c, Component::CurDir))
            .collect();
        let rel: PathBuf = comps
            .into_iter()
            .skip(1)
            .filter(|c| !matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_)))
            .collect();
        if rel.as_os_str().is_empty() {
            continue;
        }

        let out = dest_dir.join(&rel);
        if entry.header().entry_type().is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| format!("创建目录失败: {e}"))?;
        } else {
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
            }
            entry
                .unpack(&out)
                .map_err(|e| format!("解压条目 {} 失败: {e}", rel.display()))?;
        }
    }
    Ok(())
}

/// AppState 槽位的默认值（lib.rs 初始化用）
pub fn initial_job_slot() -> Arc<TokioMutex<Option<DownloadJob>>> {
    Arc::new(TokioMutex::new(None))
}
