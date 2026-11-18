//! 视频整段音频的离线字幕识别。
//!
//! 与直播实时管线（`pipeline.rs`）的区别：音频是视频 DASH 音轨的完整文件，
//! 需要 MP4（含 fragmented MP4）解复用，并按 VAD 片段产出带绝对时间戳的
//! 完整字幕轨道，供播放页/视频弹幕窗当作普通 CC 字幕浏览与跳转。

use std::fs::File;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration as StdDuration, Instant};

use serde::{Deserialize, Serialize};
use sherpa_onnx::LinearResampler;
use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::codecs::CodecParameters;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;

use crate::models::video::SubtitleLine;
use crate::stt::pipeline::{create_batch_vad, extract_f32_samples, BatchRecognizer};

/// 识别器与 VAD 统一使用的采样率。
const TARGET_SAMPLE_RATE: u64 = 16000;
/// 短句切分阈值：超过这个长度才按标点换行，避免一句字幕过长。
const SOFT_LINE_CHARS: usize = 42;
/// 进度事件的最小间隔，避免解复用/解码循环里高频 emit。
const PROGRESS_INTERVAL: StdDuration = StdDuration::from_millis(400);

/// 会话内的视频字幕缓存键（bvid + cid，分 P 必须区分）。
pub fn cache_key(bvid: &str, cid: u64) -> String {
    format!("{bvid}:{cid}")
}

/// 一次批量识别任务的取消句柄。
pub struct VideoSttJob {
    pub id: u64,
    pub bvid: String,
    pub cid: u64,
    pub cancel: std::sync::Arc<AtomicBool>,
}

/// 已完成的一条视频字幕轨道（仅进程内缓存，不落盘）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoSttTrack {
    pub bvid: String,
    pub cid: u64,
    pub model_id: String,
    /// 音轨总时长（秒）
    pub duration: f64,
    pub lines: Vec<SubtitleLine>,
}

/// `video-stt` 事件阶段。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum VideoSttPhase {
    Downloading,
    Decoding,
    Recognizing,
    Done,
    Cancelled,
    Error,
}

/// 推送到前端的批量识别进度事件。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoSttEvent {
    pub bvid: String,
    pub cid: u64,
    pub phase: VideoSttPhase,
    /// 当前阶段内的进度（0~1）
    pub progress: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<SubtitleLine>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// 下载整段音轨到本地临时文件。`on_progress` 按字节进度回调（0~1）。
///
/// 返回 `Ok(())`；取消时返回 `Err`，调用方用 `cancel` 标志区分。
pub async fn download_audio(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    cancel: &AtomicBool,
    mut on_progress: impl FnMut(f32),
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let mut response = client
        .get(url)
        .header("Referer", crate::bili::BILI_REFERER)
        .send()
        .await
        .map_err(|e| format!("音轨请求失败: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("音轨下载失败: CDN 返回 {}", response.status()));
    }

    let total = response.content_length();
    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| format!("创建临时音频文件失败: {e}"))?;
    let mut written: u64 = 0;

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("音轨下载中断: {e}"))?
    {
        if cancel.load(Ordering::Relaxed) {
            return Err("cancelled".to_string());
        }
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("写入临时音频文件失败: {e}"))?;
        written += chunk.len() as u64;
        if let Some(total) = total.filter(|total| *total > 0) {
            on_progress((written as f32 / total as f32).clamp(0.0, 1.0));
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("刷新临时音频文件失败: {e}"))?;
    on_progress(1.0);
    Ok(())
}

/// 识别本地 MP4/fMP4 音轨，返回完整字幕轨道与音轨时长（秒）。
///
/// `on_line` 每产出一行字幕回调一次；`on_progress` 按已处理音频进度回调（0~1）。
pub fn recognize_mp4(
    model_dir: &Path,
    file: &Path,
    cancel: &AtomicBool,
    mut on_line: impl FnMut(SubtitleLine),
    mut on_progress: impl FnMut(f32),
) -> Result<(Vec<SubtitleLine>, f64), String> {
    let source = File::open(file).map_err(|e| format!("打开临时音频文件失败: {e}"))?;
    let stream = MediaSourceStream::new(Box::new(source), MediaSourceStreamOptions::default());

    let mut hint = Hint::new();
    hint.with_extension("m4a");
    let mut reader = symphonia::default::get_probe()
        .probe(
            &hint,
            stream,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(|e| format!("无法解析音频容器（可能不是有效的 MP4 音轨）: {e}"))?;

    // 选第一条音频轨（B 站 DASH 音轨只有一条）。参数需要 clone 出来，
    // 后面 next_packet() 需要独占借用 reader。
    let (track_id, params, time_base, track_duration) = reader
        .tracks()
        .iter()
        .find_map(|track| match &track.codec_params {
            Some(CodecParameters::Audio(params)) => Some((
                track.id,
                params.clone(),
                track.time_base.clone(),
                track.duration,
            )),
            _ => None,
        })
        .ok_or_else(|| "音频文件不包含可识别的音轨".to_string())?;

    let sample_rate = params.sample_rate.unwrap_or(48_000);
    // 进度条用的总时长：优先音轨时长，缺失时退回容器时长
    let total_seconds = match (time_base.clone(), track_duration) {
        (Some(time_base), Some(duration)) => time_base.calc_duration(duration),
        _ => reader
            .media_info()
            .time_base
            .clone()
            .zip(reader.media_info().duration)
            .and_then(|(time_base, duration)| time_base.calc_duration(duration)),
    }
    .map(|time| time.as_secs_f64())
    .filter(|seconds| *seconds > 1.0);

    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(&params, &AudioDecoderOptions::default())
        .map_err(|e| format!("创建音频解码器失败: {e}"))?;
    let resampler = LinearResampler::create(sample_rate as i32, TARGET_SAMPLE_RATE as i32)
        .ok_or_else(|| "创建音频重采样器失败".to_string())?;
    let recognizer = BatchRecognizer::create(model_dir)?;
    // 离线模型必须依赖 VAD；流式模型的下载包不一定附带 `_vad`，缺失时退回端点切句
    let mut vad = match create_batch_vad(model_dir) {
        Ok(vad) => Some(vad),
        Err(error) if recognizer.is_streaming() => {
            log::warn!("视频 STT: VAD 不可用，流式模型改用端点切句（时间戳为近似值）: {error}");
            None
        }
        Err(error) => return Err(error),
    };
    let mut streaming = if vad.is_none() {
        recognizer.streaming_session()
    } else {
        None
    };
    let mut last_streaming_end = 0.0f64;

    let mut lines: Vec<SubtitleLine> = Vec::new();
    let mut fed_samples: u64 = 0;
    let mut last_progress = Instant::now()
        .checked_sub(PROGRESS_INTERVAL)
        .unwrap_or_else(Instant::now);

    let drain_vad = |vad: &mut sherpa_onnx::VoiceActivityDetector,
                     lines: &mut Vec<SubtitleLine>,
                     on_line: &mut dyn FnMut(SubtitleLine)|
     -> Result<(), String> {
        while let Some(segment) = vad.front() {
            if cancel.load(Ordering::Relaxed) {
                return Err("cancelled".to_string());
            }
            let from = segment.start() as f64 / TARGET_SAMPLE_RATE as f64;
            let to = (segment.start() + segment.n() as i64) as f64 / TARGET_SAMPLE_RATE as f64;
            if let Some(text) = recognizer.recognize(segment.samples()) {
                for line in split_line(&text, from, to) {
                    lines.push(line.clone());
                    on_line(line);
                }
            }
            vad.pop();
        }
        Ok(())
    };

    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("cancelled".to_string());
        }
        let packet = match reader.next_packet() {
            Ok(Some(packet)) => packet,
            Ok(None) => break,
            Err(SymphoniaError::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(SymphoniaError::IoError(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(SymphoniaError::DecodeError(message)) => {
                log::trace!("视频 STT: 丢弃无法解析的数据包: {message}");
                continue;
            }
            Err(error) => return Err(format!("读取音频数据失败: {error}")),
        };
        if packet.track_id != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(SymphoniaError::DecodeError(message)) => {
                log::trace!("视频 STT: AAC 解码错误: {message}");
                continue;
            }
            Err(SymphoniaError::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(error) => return Err(format!("音频解码失败: {error}")),
        };
        let mut samples = Vec::new();
        extract_f32_samples(&decoded, 0, &mut samples);
        if samples.is_empty() {
            continue;
        }

        let resampled = resampler.resample(&samples, false);
        if resampled.is_empty() {
            continue;
        }
        fed_samples += resampled.len() as u64;
        if let Some(vad) = vad.as_mut() {
            vad.accept_waveform(&resampled);
            drain_vad(vad, &mut lines, &mut on_line)?;
        } else if let Some(session) = streaming.as_mut() {
            if let Some(text) = session.accept(&resampled) {
                push_streaming_lines(
                    &text,
                    fed_samples,
                    &mut last_streaming_end,
                    &mut lines,
                    &mut on_line,
                );
            }
        }

        if last_progress.elapsed() >= PROGRESS_INTERVAL {
            last_progress = Instant::now();
            if let Some(total) = total_seconds {
                let position = fed_samples as f64 / TARGET_SAMPLE_RATE as f64;
                on_progress((position / total).clamp(0.0, 0.99) as f32);
            }
        }
    }

    // 尾段：冲掉重采样器与 VAD/流式会话的内部缓冲
    let tail = resampler.resample(&[], true);
    if !tail.is_empty() {
        fed_samples += tail.len() as u64;
        if let Some(vad) = vad.as_mut() {
            vad.accept_waveform(&tail);
            drain_vad(vad, &mut lines, &mut on_line)?;
        } else if let Some(session) = streaming.as_mut() {
            if let Some(text) = session.accept(&tail) {
                push_streaming_lines(
                    &text,
                    fed_samples,
                    &mut last_streaming_end,
                    &mut lines,
                    &mut on_line,
                );
            }
        }
    }
    if let Some(vad) = vad.as_mut() {
        vad.flush();
        drain_vad(vad, &mut lines, &mut on_line)?;
    } else if let Some(session) = streaming.as_ref() {
        if let Some(text) = session.finish() {
            push_streaming_lines(
                &text,
                fed_samples,
                &mut last_streaming_end,
                &mut lines,
                &mut on_line,
            );
        }
    }

    let duration = total_seconds.unwrap_or(fed_samples as f64 / TARGET_SAMPLE_RATE as f64);
    on_progress(1.0);
    Ok((lines, duration))
}

/// 端点切句的兜底路径：端点只给出句尾时间，句首按最长 8 秒回推。
fn push_streaming_lines(
    text: &str,
    fed_samples: u64,
    last_end: &mut f64,
    lines: &mut Vec<SubtitleLine>,
    on_line: &mut dyn FnMut(SubtitleLine),
) {
    let to = fed_samples as f64 / TARGET_SAMPLE_RATE as f64;
    let from = last_end.max(to - 8.0);
    for line in split_line(text, from, to) {
        lines.push(line.clone());
        on_line(line);
    }
    *last_end = to;
}

/// 把一段识别文本切成字幕长度的行；时间按字符数比例分配。
///
/// VAD 片段最长 7 秒，通常已经接近一行字幕；只有明显偏长的片段才在
/// 句末/逗号处换行，宁可保留长行也不做不可靠的硬切。
fn split_line(text: &str, from: f64, to: f64) -> Vec<SubtitleLine> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= SOFT_LINE_CHARS || to - from < 2.0 {
        return vec![SubtitleLine {
            from,
            to,
            content: trimmed.to_string(),
        }];
    }

    let mut parts: Vec<String> = Vec::new();
    let mut start = 0;
    for (index, character) in chars.iter().enumerate() {
        let hard_break = matches!(character, '。' | '！' | '？' | '!' | '?' | '；' | ';');
        let soft_break = matches!(character, '，' | ',' | '、');
        let length = index + 1 - start;
        if (hard_break && length >= 12) || (soft_break && length >= 26 && parts.len() < 2) {
            parts.push(chars[start..=index].iter().collect());
            start = index + 1;
            if parts.len() >= 3 {
                break;
            }
        }
    }
    if start < chars.len() {
        parts.push(chars[start..].iter().collect());
    }
    if parts.len() <= 1 {
        return vec![SubtitleLine {
            from,
            to,
            content: trimmed.to_string(),
        }];
    }

    let total_chars = chars.len() as f64;
    let mut cursor = from;
    let mut lines = Vec::with_capacity(parts.len());
    for (index, part) in parts.iter().enumerate() {
        let content = part.trim();
        if content.is_empty() {
            continue;
        }
        let end = if index + 1 == parts.len() {
            to
        } else {
            cursor + (to - from) * (part.chars().count() as f64 / total_chars)
        };
        lines.push(SubtitleLine {
            from: cursor,
            to: end,
            content: content.to_string(),
        });
        cursor = end;
    }
    lines
}

