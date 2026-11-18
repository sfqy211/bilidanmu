//! 视频语音转字幕命令。
//!
//! 与直播实时字幕不同：视频是一次性把整段音轨识别成完整字幕轨道，
//! 结果只保存在进程内的会话缓存（重启即清空），并且同一时间只跑一个任务。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager, State};

use crate::commands::{build_api_client, stt as stt_commands};
use crate::models::video::SubtitleLine;
use crate::settings_store;
use crate::stt::video_stt::{self, VideoSttEvent, VideoSttJob, VideoSttPhase, VideoSttTrack};
use crate::AppState;

/// 任务序号：任务结束时只清理自己那条 job 记录。
static VIDEO_STT_JOB_SEQ: AtomicU64 = AtomicU64::new(1);

fn emit_event(
    app: &AppHandle,
    bvid: &str,
    cid: u64,
    phase: VideoSttPhase,
    progress: f32,
    line: Option<SubtitleLine>,
    message: Option<String>,
) {
    let _ = app.emit(
        "video-stt",
        VideoSttEvent {
            bvid: bvid.to_string(),
            cid,
            phase,
            progress,
            line,
            message,
        },
    );
}

/// 读取会话内缓存的视频字幕轨道（不存在返回 null）。
#[tauri::command]
pub fn get_video_stt(
    bvid: String,
    cid: u64,
    state: State<'_, AppState>,
) -> Result<Option<VideoSttTrack>, String> {
    let cache = state
        .video_stt_cache
        .lock()
        .map_err(|_| "视频字幕缓存不可用".to_string())?;
    Ok(cache.get(&video_stt::cache_key(&bvid, cid)).cloned())
}

/// 开始整段识别。已有缓存时直接返回（前端会收到 done 事件）。
#[tauri::command]
pub async fn start_video_stt(
    app: AppHandle,
    bvid: String,
    cid: u64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let bvid = bvid.trim().to_string();
    if bvid.is_empty() || cid == 0 {
        return Err("无效的视频标识".to_string());
    }

    let cached = state
        .video_stt_cache
        .lock()
        .map_err(|_| "视频字幕缓存不可用".to_string())?
        .contains_key(&video_stt::cache_key(&bvid, cid));
    if cached {
        emit_event(&app, &bvid, cid, VideoSttPhase::Done, 1.0, None, None);
        return Ok(());
    }

    // 单任务：切换视频时前端会主动 stop，这里再兜底取消上一个任务
    {
        let mut job = state.video_stt_job.lock().await;
        if let Some(previous) = job.take() {
            previous.cancel.store(true, Ordering::Relaxed);
        }
    }

    let settings =
        settings_store::load_settings(state.inner()).map_err(|e| format!("读取设置失败: {e}"))?;
    let model_id = settings.stt.model_id.clone();
    let model_dir = stt_commands::get_model_dir(&app, state.inner(), &model_id)?;

    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state);
    let (url, _codec) = api.get_video_audio_url(&bvid, cid).await?;

    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("获取缓存目录失败: {e}"))?
        .join("video-stt");
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("创建缓存目录失败: {e}"))?;

    let cancel = Arc::new(AtomicBool::new(false));
    let job_id = VIDEO_STT_JOB_SEQ.fetch_add(1, Ordering::Relaxed);
    // 文件名带任务序号：取消旧任务时它仍可能删自己的临时文件，不能和新任务共用路径
    let dest = cache_dir.join(format!("{bvid}-{cid}-{job_id}.m4s"));
    let cache = state.video_stt_cache.clone();
    let jobs = state.video_stt_job.clone();
    let client = state.proxy_client.clone();

    let task_app = app.clone();
    let task_bvid = bvid.clone();
    let task_cancel = cancel.clone();
    let task_dest = dest.clone();
    let task_model_dir = model_dir.clone();

    tokio::spawn(async move {
        run_job(
            task_app,
            client,
            url,
            task_dest,
            task_model_dir,
            model_id,
            task_bvid,
            cid,
            cache,
            task_cancel,
        )
        .await;

        let mut jobs_guard = jobs.lock().await;
        if jobs_guard.as_ref().map(|job| job.id) == Some(job_id) {
            jobs_guard.take();
        }
    });

    *state.video_stt_job.lock().await = Some(VideoSttJob {
        id: job_id,
        bvid,
        cid,
        cancel,
    });
    Ok(())
}

/// 停止当前识别（切视频/离开页面时调用）。
#[tauri::command]
pub async fn stop_video_stt(state: State<'_, AppState>) -> Result<(), String> {
    if let Some(job) = state.video_stt_job.lock().await.take() {
        job.cancel.store(true, Ordering::Relaxed);
    }
    Ok(())
}

/// 清除某个视频的会话缓存；若该视频正在识别则一并取消。
#[tauri::command]
pub async fn clear_video_stt(
    bvid: String,
    cid: u64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if let Ok(mut cache) = state.video_stt_cache.lock() {
        cache.remove(&video_stt::cache_key(&bvid, cid));
    }
    let mut job = state.video_stt_job.lock().await;
    if job
        .as_ref()
        .is_some_and(|job| job.bvid == bvid && job.cid == cid)
    {
        if let Some(job) = job.take() {
            job.cancel.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn run_job(
    app: AppHandle,
    client: reqwest::Client,
    url: String,
    dest: PathBuf,
    model_dir: String,
    model_id: String,
    bvid: String,
    cid: u64,
    cache: Arc<Mutex<HashMap<String, VideoSttTrack>>>,
    cancel: Arc<AtomicBool>,
) {
    emit_event(&app, &bvid, cid, VideoSttPhase::Downloading, 0.0, None, None);

    let download_app = app.clone();
    let download_bvid = bvid.clone();
    let downloaded = video_stt::download_audio(&client, &url, &dest, &cancel, |progress| {
        emit_event(
            &download_app,
            &download_bvid,
            cid,
            VideoSttPhase::Downloading,
            progress,
            None,
            None,
        );
    })
    .await;

    if let Err(error) = downloaded {
        let _ = std::fs::remove_file(&dest);
        if cancel.load(Ordering::Relaxed) {
            emit_event(&app, &bvid, cid, VideoSttPhase::Cancelled, 0.0, None, None);
        } else {
            emit_event(&app, &bvid, cid, VideoSttPhase::Error, 0.0, None, Some(error));
        }
        return;
    }

    emit_event(&app, &bvid, cid, VideoSttPhase::Decoding, 0.0, None, None);

    let recognize_app = app.clone();
    let recognize_bvid = bvid.clone();
    let recognize_cancel = cancel.clone();
    let recognize_dest = dest.clone();
    let recognize_model_dir = PathBuf::from(&model_dir);
    let result = tokio::task::spawn_blocking(move || {
        video_stt::recognize_mp4(
            &recognize_model_dir,
            &recognize_dest,
            &recognize_cancel,
            |line| {
                emit_event(
                    &recognize_app,
                    &recognize_bvid,
                    cid,
                    VideoSttPhase::Recognizing,
                    0.0,
                    Some(line),
                    None,
                );
            },
            |progress| {
                emit_event(
                    &recognize_app,
                    &recognize_bvid,
                    cid,
                    VideoSttPhase::Recognizing,
                    progress,
                    None,
                    None,
                );
            },
        )
    })
    .await;

    let _ = std::fs::remove_file(&dest);

    match result {
        Ok(Ok((lines, duration))) => {
            if cancel.load(Ordering::Relaxed) {
                emit_event(&app, &bvid, cid, VideoSttPhase::Cancelled, 0.0, None, None);
                return;
            }
            if let Ok(mut cache) = cache.lock() {
                cache.insert(
                    video_stt::cache_key(&bvid, cid),
                    VideoSttTrack {
                        bvid: bvid.clone(),
                        cid,
                        model_id,
                        duration,
                        lines,
                    },
                );
            }
            emit_event(&app, &bvid, cid, VideoSttPhase::Done, 1.0, None, None);
        }
        Ok(Err(error)) => {
            if cancel.load(Ordering::Relaxed) {
                emit_event(&app, &bvid, cid, VideoSttPhase::Cancelled, 0.0, None, None);
            } else {
                emit_event(&app, &bvid, cid, VideoSttPhase::Error, 0.0, None, Some(error));
            }
        }
        Err(error) => emit_event(
            &app,
            &bvid,
            cid,
            VideoSttPhase::Error,
            0.0,
            None,
            Some(format!("识别任务异常: {error}")),
        ),
    }
}
