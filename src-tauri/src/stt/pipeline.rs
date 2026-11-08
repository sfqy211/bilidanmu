//! Main STT pipeline: FLV demux → AAC decode (symphonia) →
//! resample (sherpa-onnx LinearResampler) → sherpa-onnx OnlineRecognizer →
//! emit transcript events

use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use bytes::Bytes;
use sherpa_onnx::{
    LinearResampler, OfflineRecognizer, OfflineRecognizerConfig, OnlineRecognizer,
    OnlineRecognizerConfig, OnlineStream, SileroVadModelConfig, VadModelConfig,
    VoiceActivityDetector,
};
use symphonia::core::audio::{Audio, Channels, GenericAudioBufferRef};
use symphonia::core::codecs::audio::well_known::{CODEC_ID_AAC, profiles::CODEC_PROFILE_AAC_LC};
use symphonia::core::codecs::audio::{AudioCodecParameters, AudioDecoder, AudioDecoderOptions};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::packet::Packet;
use symphonia::core::units::{Duration, Timestamp};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use crate::stt::flv_demux::FlvDemuxer;
use crate::stt::SttTranscript;

/// Target sample rate fed to the recognizer (after resampling).
const TARGET_SAMPLE_RATE: u64 = 16000;

/// Messages on the bytes channel from the proxy tee.
pub enum PipelineMessage {
    /// FLV stream bytes to demux/decode/recognize.
    Bytes(Bytes),
    /// A new tee connection replaced the old one: reset the audio timeline
    /// (epoch bump) so timestamps stay meaningful for the fresh stream.
    ResetStream,
}

/// 模型家族标记（`model.meta.json` 优先，目录内容启发式兜底）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ModelKind {
    /// 流式 transducer（encoder/decoder/joiner）
    Transducer,
    /// 流式 paraformer（encoder/decoder，无 joiner）
    Paraformer,
    /// 流式 CTC（仅 encoder）
    Ctc,
    /// 离线 SenseVoice（含同架构的 FunASR-Nano）
    SenseVoice,
    /// 离线 FireRedASR/2（encoder/decoder transducer 式）
    FireRed,
    /// 离线 Qwen3-ASR（conv_frontend/encoder/decoder/tokenizer）
    Qwen3,
}

impl ModelKind {
    fn is_offline(self) -> bool {
        matches!(self, ModelKind::SenseVoice | ModelKind::FireRed | ModelKind::Qwen3)
    }

    /// 读 `model.meta.json`（下载器解压成功后写入的 `{"kind": "..."}`）。
    fn from_meta(model_dir: &Path) -> Option<Self> {
        let raw = std::fs::read_to_string(model_dir.join("model.meta.json")).ok()?;
        let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
        let kind = json.get("kind")?.as_str()?;
        Some(match kind {
            "transducer" => ModelKind::Transducer,
            "paraformer" => ModelKind::Paraformer,
            "ctc" => ModelKind::Ctc,
            "sensevoice" => ModelKind::SenseVoice,
            "firered" => ModelKind::FireRed,
            "qwen3" => ModelKind::Qwen3,
            _ => return None,
        })
    }

    /// 手动放置（无 meta）时的目录内容启发式。
    fn from_files(files: &ModelFiles) -> Option<Self> {
        if files.joiner.is_some() {
            Some(ModelKind::Transducer)
        } else if files.conv_frontend.is_some() || files.tokenizer.is_some() {
            Some(ModelKind::Qwen3)
        } else if files.model_onnx.is_some() {
            Some(ModelKind::SenseVoice)
        } else if files.decoder.is_some() {
            Some(ModelKind::Paraformer)
        } else if files.encoder.is_some() {
            Some(ModelKind::Ctc)
        } else {
            None
        }
    }
}

/// 目录内发现的模型文件（int8 变体优先）。
#[derive(Debug, Default)]
struct ModelFiles {
    encoder: Option<String>,
    decoder: Option<String>,
    joiner: Option<String>,
    /// SenseVoice 系：model*.onnx（非 encoder/decoder 前缀）
    model_onnx: Option<String>,
    /// Qwen3 系
    conv_frontend: Option<String>,
    tokenizer: Option<String>,
    tokens: Option<String>,
}

/// 从候选中挑一个：int8 优先，其次最后一个（文件名序）。
fn pick_variant(paths: &mut Vec<String>) -> Option<String> {
    if paths.len() <= 1 {
        return paths.pop();
    }
    let int8 = paths.iter().position(|p| p.ends_with(".int8.onnx"));
    let chosen = int8.unwrap_or(paths.len() - 1);
    Some(paths.swap_remove(chosen))
}

/// 扫描模型目录，发现全部 onnx/tokens 资产。
fn find_model_files(model_dir: &Path) -> Result<ModelFiles, String> {
    let dir =
        std::fs::read_dir(model_dir).map_err(|e| format!("无法读取模型目录: {e}"))?;

    let mut encoders: Vec<String> = Vec::new();
    let mut decoders: Vec<String> = Vec::new();
    let mut joiners: Vec<String> = Vec::new();
    let mut models: Vec<String> = Vec::new();
    let mut convs: Vec<String> = Vec::new();
    let mut files = ModelFiles::default();

    for entry in dir {
        let entry = entry.map_err(|e| format!("目录条目错误: {e}"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path().to_string_lossy().to_string();

        if name == "tokens.txt" {
            files.tokens = Some(path);
        } else if !name.ends_with(".onnx") {
            if name.starts_with("tokenizer") {
                files.tokenizer = Some(path);
            }
        } else if name.starts_with("encoder") {
            encoders.push(path);
        } else if name.starts_with("decoder") {
            decoders.push(path);
        } else if name.starts_with("joiner") {
            joiners.push(path);
        } else if name.starts_with("conv_frontend") {
            convs.push(path);
        } else if name.starts_with("model") {
            models.push(path);
        }
    }

    files.encoder = pick_variant(&mut encoders);
    files.decoder = pick_variant(&mut decoders);
    files.joiner = pick_variant(&mut joiners);
    files.model_onnx = pick_variant(&mut models);
    files.conv_frontend = pick_variant(&mut convs);
    Ok(files)
}

/// 解析模型目录：kind + 文件齐备性校验。
fn resolve_model(model_dir: &Path) -> Result<(ModelKind, ModelFiles), String> {
    let mut files = find_model_files(model_dir)?;
    let kind = ModelKind::from_meta(model_dir)
        .or_else(|| ModelKind::from_files(&files))
        .ok_or_else(|| "无法识别模型类型（缺少 joiner/encoder 等特征文件）".to_string())?;
    // tokens.txt 除 Qwen3（可用 tokenizer 顶替）外均为必需
    if kind != ModelKind::Qwen3 && files.tokens.is_none() {
        return Err("找不到 tokens.txt 文件".to_string());
    }

    // 按 kind 校验关键文件齐备（qwen3 的 tokens.txt 缺失可由 tokenizer 顶替）
    let ok = match kind {
        ModelKind::Transducer => {
            files.encoder.is_some() && files.decoder.is_some() && files.joiner.is_some()
        }
        ModelKind::Paraformer | ModelKind::FireRed => {
            files.encoder.is_some() && files.decoder.is_some()
        }
        // CTC 包内命名不统一：大包用 encoder*.onnx，小包用 model*.onnx
        ModelKind::Ctc => files.encoder.is_some() || files.model_onnx.is_some(),
        ModelKind::SenseVoice => files.model_onnx.is_some(),
        ModelKind::Qwen3 => {
            files.conv_frontend.is_some()
                && files.encoder.is_some()
                && files.decoder.is_some()
                && (files.tokenizer.is_some() || files.tokens.is_some())
        }
    };
    if !ok {
        return Err(format!("模型文件不完整（类型 {:?}）", kind));
    }

    // tokens 兜底：qwen3 无 tokens.txt 时不强制
    if kind == ModelKind::Qwen3 && files.tokens.is_none() {
        files.tokens = files.tokenizer.clone();
    }
    Ok((kind, files))
}

/// Persistent AAC decoder state that survives across frames.
///
/// The decoder instance is reused across frames (the most expensive part),
/// while a new format_reader is created per-frame since symphonia doesn't
/// support appending data to an existing stream.
struct AacDecoder {
    decoder: Box<dyn AudioDecoder>,
    track_id: u32,
    channels: usize,
    consecutive_decode_errors: u8,
}

impl AacDecoder {
    /// Create a new persistent AAC decoder with manually-constructed codec parameters.
    ///
    /// Bypasses symphonia's probe entirely — we already know the codec (AAC-LC),
    /// sample rate, and channel count from the FLV AudioSpecificConfig, so we
    /// construct `AudioCodecParameters` directly and instantiate the decoder.
    fn new(sample_rate: u32, num_channels: u32) -> Result<Self, String> {
        let channels = Channels::Discrete(num_channels as u16);

        let mut audio_params = AudioCodecParameters::new();
        audio_params
            .for_codec(CODEC_ID_AAC)
            .with_profile(CODEC_PROFILE_AAC_LC)
            .with_sample_rate(sample_rate)
            .with_channels(channels);

        // Build a minimal AudioSpecificConfig with AAC-LC profile.
        // The FLV stream's ASC may declare a different object type (e.g. AAC-LD)
        // while the actual audio data is AAC-LC. We override to ensure correctness.
        let sf_index = match sample_rate {
            96000 => 0u8, 88200 => 1, 64000 => 2, 48000 => 3,
            44100 => 4, 32000 => 5, 24000 => 6, 22050 => 7,
            16000 => 8, 12000 => 9, 11025 => 10, 8000 => 11,
            _ => 3,
        };
        let ch_config = num_channels.min(7) as u8;
        // 5 bits objectType(2=AAC-LC) | 4 bits sf_index | 4 bits ch_config | 3 bits padding
        let asc_bytes = vec![
            (2u8 << 3) | (sf_index >> 1),
            ((sf_index & 1) << 7) | (ch_config << 3),
        ];
        audio_params.with_extra_data(asc_bytes.into_boxed_slice());

        let decoder_opts = AudioDecoderOptions::default();
        let decoder = symphonia::default::get_codecs()
            .make_audio_decoder(&audio_params, &decoder_opts)
            .map_err(|e| format!("创建 AAC 解码器失败: {e}"))?;

        Ok(Self {
            decoder,
            track_id: 1,
            channels: num_channels as usize,
            consecutive_decode_errors: 0,
        })
    }

    /// Decode ADTS-wrapped AAC frames by parsing the ADTS headers directly.
    ///
    /// No probe or format reader — we iterate through the buffer looking for
    /// ADTS sync words (0xFFF), parse the 7-byte header to get frame length,
    /// extract the raw AAC payload, and feed it to the persistent decoder.
    fn decode_frame(&mut self, adts_data: &[u8]) -> Result<Vec<f32>, String> {
        let mut all_samples: Vec<f32> = Vec::new();
        let mut pos = 0;

        while pos + 7 <= adts_data.len() {
            // Look for ADTS syncword: 12 bits all set (0xFFF)
            if adts_data[pos] != 0xFF || (adts_data[pos + 1] & 0xF0) != 0xF0 {
                pos += 1;
                continue;
            }

            if pos + 7 > adts_data.len() {
                break;
            }

            // Parse ADTS header to get frame length (13 bits at bytes 3-5)
            let frame_len = (((adts_data[pos + 3] & 0x03) as usize) << 11)
                          | ((adts_data[pos + 4] as usize) << 3)
                          | ((adts_data[pos + 5] as usize) >> 5);

            if frame_len < 7 || pos + frame_len > adts_data.len() {
                break; // incomplete frame
            }

            // Raw AAC data starts after the 7-byte ADTS header
            let raw_aac = &adts_data[pos + 7..pos + frame_len];

            // AAC-LC always produces 1024 samples per frame
            let pkt = Packet::new(
                self.track_id,
                Timestamp::ZERO,
                Duration::new(1024),
                raw_aac,
            );

            match self.decoder.decode(&pkt) {
                Ok(audio_buf) => {
                    self.consecutive_decode_errors = 0;
                    extract_f32_samples(&audio_buf, self.channels, &mut all_samples);
                }
                Err(SymphoniaError::DecodeError(e)) => {
                    self.consecutive_decode_errors = self.consecutive_decode_errors.saturating_add(1);
                    log::trace!("AAC decode error: {e}");
                }
                Err(e) => return Err(e.to_string()),
            }

            pos += frame_len;
        }

        Ok(all_samples)
    }

    fn should_recreate(&self) -> bool {
        self.consecutive_decode_errors >= 3
    }

}

/// Extract f32 samples from decoded audio buffer, converting to mono.
///
/// Uses the channel count from the decoded buffer (`actual_channels`) rather
/// than the FLV header to avoid mixing inconsistencies when the two disagree (#7).
/// Unsigned types are centered to [-1, 1] to avoid DC bias (#2).
fn extract_f32_samples(
    audio_buf: &GenericAudioBufferRef<'_>,
    _num_channels: usize, // kept for API compat, unused — see #7
    dest: &mut Vec<f32>,
) {
    let frames = audio_buf.frames();
    if frames == 0 {
        return;
    }

    // Use the decoder's channel count for mixing (#7: channels inconsistency)
    let actual_channels = audio_buf.spec().channels().count();
    if actual_channels == 0 {
        return;
    }

    // Convert to f32 planar and mix to mono.
    // Unsigned types are centered to [-1, 1] to avoid DC bias (#2).
    #[allow(unreachable_patterns)] // _ arm is for future symphonia variants
    match audio_buf {
        GenericAudioBufferRef::U8(buf) => {
            for frame in 0..frames {
                let mut sum = 0.0f32;
                for ch in 0..buf.spec().channels().count() {
                    if let Some(plane) = buf.plane(ch) {
                        sum += (plane[frame] as f32 - 128.0) / 128.0;
                    }
                }
                dest.push(sum / actual_channels as f32);
            }
        }
        GenericAudioBufferRef::U16(buf) => {
            for frame in 0..frames {
                let mut sum = 0.0f32;
                for ch in 0..buf.spec().channels().count() {
                    if let Some(plane) = buf.plane(ch) {
                        sum += (plane[frame] as f32 - 32768.0) / 32768.0;
                    }
                }
                dest.push(sum / actual_channels as f32);
            }
        }
        GenericAudioBufferRef::U24(buf) => {
            for frame in 0..frames {
                let mut sum = 0.0f32;
                for ch in 0..buf.spec().channels().count() {
                    if let Some(plane) = buf.plane(ch) {
                        sum += (plane[frame].0 as f32 - 8388608.0) / 8388608.0;
                    }
                }
                dest.push(sum / actual_channels as f32);
            }
        }
        GenericAudioBufferRef::U32(buf) => {
            for frame in 0..frames {
                let mut sum = 0.0f32;
                for ch in 0..buf.spec().channels().count() {
                    if let Some(plane) = buf.plane(ch) {
                        sum += (plane[frame] as f32 - 2147483648.0) / 2147483648.0;
                    }
                }
                dest.push(sum / actual_channels as f32);
            }
        }
        GenericAudioBufferRef::S8(buf) => {
            for frame in 0..frames {
                let mut sum = 0.0f32;
                for ch in 0..buf.spec().channels().count() {
                    if let Some(plane) = buf.plane(ch) {
                        sum += plane[frame] as f32 / 128.0;
                    }
                }
                dest.push(sum / actual_channels as f32);
            }
        }
        GenericAudioBufferRef::S16(buf) => {
            for frame in 0..frames {
                let mut sum = 0.0f32;
                for ch in 0..buf.spec().channels().count() {
                    if let Some(plane) = buf.plane(ch) {
                        sum += plane[frame] as f32 / 32768.0;
                    }
                }
                dest.push(sum / actual_channels as f32);
            }
        }
        GenericAudioBufferRef::S24(buf) => {
            for frame in 0..frames {
                let mut sum = 0.0f32;
                for ch in 0..buf.spec().channels().count() {
                    if let Some(plane) = buf.plane(ch) {
                        sum += plane[frame].0 as f32 / 8388608.0;
                    }
                }
                dest.push(sum / actual_channels as f32);
            }
        }
        GenericAudioBufferRef::S32(buf) => {
            for frame in 0..frames {
                let mut sum = 0.0f32;
                for ch in 0..buf.spec().channels().count() {
                    if let Some(plane) = buf.plane(ch) {
                        sum += plane[frame] as f32 / 2147483648.0;
                    }
                }
                dest.push(sum / actual_channels as f32);
            }
        }
        GenericAudioBufferRef::F32(buf) => {
            for frame in 0..frames {
                let mut sum = 0.0f32;
                for ch in 0..buf.spec().channels().count() {
                    if let Some(plane) = buf.plane(ch) {
                        sum += plane[frame];
                    }
                }
                dest.push(sum / actual_channels as f32);
            }
        }
        GenericAudioBufferRef::F64(buf) => {
            for frame in 0..frames {
                let mut sum = 0.0f32;
                for ch in 0..buf.spec().channels().count() {
                    if let Some(plane) = buf.plane(ch) {
                        sum += plane[frame] as f32;
                    }
                }
                dest.push(sum / actual_channels as f32);
            }
        }
        // Future-proof: catch any new format symphonia may add (#9)
        _ => {
            log::warn!("STT: unsupported audio buffer format, skipping frame");
        }
    }
}

/// 待 emit 的识别文本事件（ingest/flush 返回）。
struct EmittedText {
    text: String,
    is_final: bool,
}

/// 识别引擎：流式（边说边出字）或离线（VAD 切句 + 整句识别）。
enum Engine {
    Streaming {
        recognizer: OnlineRecognizer,
        stream: OnlineStream,
    },
    Offline {
        recognizer: OfflineRecognizer,
        vad: VoiceActivityDetector,
    },
}

/// Pipeline configuration state, created once at start.
struct PipelineState {
    engine: Engine,
    resampler: LinearResampler,
    flv_demuxer: FlvDemuxer,
    aac_decoder: Option<AacDecoder>,
    /// 流式 partial 去重缓存（离线模式不使用）
    last_streaming_text: String,
}

impl PipelineState {
    fn new(model_dir: &Path) -> Result<Self, String> {
        let (kind, files) = resolve_model(model_dir)?;

        let engine = if kind.is_offline() {
            Engine::Offline {
                recognizer: Self::create_offline(kind, &files)?,
                vad: Self::create_vad(model_dir)?,
            }
        } else {
            let recognizer = Self::create_online(kind, &files)?;
            let stream = recognizer.create_stream();
            Engine::Streaming { recognizer, stream }
        };

        let resampler = LinearResampler::create(48000, 16000)
            .ok_or_else(|| "创建 LinearResampler 失败".to_string())?;
        let flv_demuxer = FlvDemuxer::new();

        Ok(Self {
            engine,
            resampler,
            flv_demuxer,
            aac_decoder: None,
            last_streaming_text: String::new(),
        })
    }

    /// 流式引擎（transducer / paraformer / ctc 三系）。
    fn create_online(kind: ModelKind, files: &ModelFiles) -> Result<OnlineRecognizer, String> {
        let mut config = OnlineRecognizerConfig::default();
        match kind {
            ModelKind::Transducer => {
                config.model_config.transducer.encoder = files.encoder.clone();
                config.model_config.transducer.decoder = files.decoder.clone();
                config.model_config.transducer.joiner = files.joiner.clone();
            }
            ModelKind::Paraformer => {
                config.model_config.paraformer.encoder = files.encoder.clone();
                config.model_config.paraformer.decoder = files.decoder.clone();
            }
            ModelKind::Ctc => {
                config.model_config.zipformer2_ctc.model =
                    files.encoder.clone().or(files.model_onnx.clone());
            }
            _ => unreachable!("非流式类型不应进入在线引擎"),
        }
        config.model_config.tokens = files.tokens.clone();
        config.enable_endpoint = true;
        config.decoding_method = Some("greedy_search".to_string());
        // Endpoint detection settings for streaming
        config.rule1_min_trailing_silence = 2.4;
        config.rule2_min_trailing_silence = 1.2;
        config.rule3_min_utterance_length = 20.0;

        OnlineRecognizer::create(&config).ok_or_else(|| "创建 OnlineRecognizer 失败".to_string())
    }

    /// 离线引擎（sensevoice / firered / qwen3 三系）。
    fn create_offline(kind: ModelKind, files: &ModelFiles) -> Result<OfflineRecognizer, String> {
        let mut config = OfflineRecognizerConfig::default();
        match kind {
            ModelKind::SenseVoice => {
                config.model_config.sense_voice.model = files.model_onnx.clone();
                config.model_config.sense_voice.use_itn = true;
            }
            ModelKind::FireRed => {
                config.model_config.fire_red_asr.encoder = files.encoder.clone();
                config.model_config.fire_red_asr.decoder = files.decoder.clone();
            }
            ModelKind::Qwen3 => {
                config.model_config.qwen3_asr.conv_frontend = files.conv_frontend.clone();
                config.model_config.qwen3_asr.encoder = files.encoder.clone();
                config.model_config.qwen3_asr.decoder = files.decoder.clone();
                config.model_config.qwen3_asr.tokenizer = files.tokenizer.clone();
            }
            _ => unreachable!("非离线类型不应进入离线引擎"),
        }
        config.model_config.tokens = files.tokens.clone();

        OfflineRecognizer::create(&config).ok_or_else(|| "创建 OfflineRecognizer 失败".to_string())
    }

    /// Silero VAD（离线模式切句依赖），模型位于模型目录上级的 `_vad/`。
    fn create_vad(model_dir: &Path) -> Result<VoiceActivityDetector, String> {
        let vad_path = model_dir
            .parent()
            .ok_or_else(|| "无法定位模型目录上级".to_string())?
            .join(super::super::commands::stt_download::VAD_DIR)
            .join(super::super::commands::stt_download::VAD_FILE);
        if !vad_path.exists() {
            return Err(format!(
                "缺少离线识别依赖的 VAD 模型: {}（请重新下载该离线模型以自动附带）",
                vad_path.display()
            ));
        }
        let config = VadModelConfig {
            silero_vad: SileroVadModelConfig {
                model: Some(vad_path.to_string_lossy().to_string()),
                threshold: 0.5,
                min_silence_duration: 0.4,
                min_speech_duration: 0.25,
                window_size: 512,
                max_speech_duration: 15.0,
            },
            ..Default::default()
        };
        VoiceActivityDetector::create(&config, 30.0)
            .ok_or_else(|| "创建 VAD 失败".to_string())
    }

    /// 喂入一段 16kHz 重采样音频并推进识别，返回待 emit 的文本事件。
    fn ingest(&mut self, resampled: &[f32]) -> Vec<EmittedText> {
        match &mut self.engine {
            Engine::Streaming { recognizer, stream } => {
                stream.accept_waveform(16000, resampled);
                while recognizer.is_ready(stream) {
                    recognizer.decode(stream);
                }
                let mut out = Vec::new();
                // 中间结果：文本变化时才发
                if let Some(result) = recognizer.get_result(stream) {
                    if !result.text.is_empty() && result.text != self.last_streaming_text {
                        self.last_streaming_text.clone_from(&result.text);
                        out.push(EmittedText { text: result.text.clone(), is_final: result.is_final });
                    }
                }
                // endpoint 命中：发最终结果并复位
                if recognizer.is_endpoint(stream) {
                    if let Some(result) = recognizer.get_result(stream) {
                        if !result.text.is_empty() {
                            out.push(EmittedText { text: result.text, is_final: true });
                        }
                    }
                    recognizer.reset(stream);
                    self.last_streaming_text.clear();
                }
                out
            }
            Engine::Offline { recognizer, vad } => {
                vad.accept_waveform(resampled);
                let mut out = Vec::new();
                // VAD 段完成 → 整句离线识别
                while let Some(seg) = vad.front() {
                    let stream = recognizer.create_stream();
                    stream.accept_waveform(16000, seg.samples());
                    recognizer.decode(&stream);
                    if let Some(result) = stream.get_result() {
                        if !result.text.trim().is_empty() {
                            out.push(EmittedText { text: result.text, is_final: true });
                        }
                    }
                    vad.pop();
                }
                out
            }
        }
    }

    /// tee 流切换：复位识别状态（音频时间轴由调用方归零）。
    fn reset_stream(&mut self) {
        match &mut self.engine {
            Engine::Streaming { recognizer, stream } => {
                recognizer.reset(stream);
            }
            Engine::Offline { vad, .. } => {
                vad.clear();
            }
        }
        self.last_streaming_text.clear();
    }

    /// 停止前排空引擎缓冲（离线模式 flush 尾段并识别）。
    fn flush(&mut self) -> Vec<EmittedText> {
        match &mut self.engine {
            Engine::Streaming { recognizer, stream } => {
                stream.input_finished();
                while recognizer.is_ready(stream) {
                    recognizer.decode(stream);
                }
                let mut out = Vec::new();
                if let Some(result) = recognizer.get_result(stream) {
                    if !result.text.is_empty() {
                        out.push(EmittedText { text: result.text, is_final: true });
                    }
                }
                out
            }
            Engine::Offline { recognizer, vad } => {
                vad.flush();
                let mut out = Vec::new();
                while let Some(seg) = vad.front() {
                    let stream = recognizer.create_stream();
                    stream.accept_waveform(16000, seg.samples());
                    recognizer.decode(&stream);
                    if let Some(result) = stream.get_result() {
                        if !result.text.trim().is_empty() {
                            out.push(EmittedText { text: result.text, is_final: true });
                        }
                    }
                    vad.pop();
                }
                out
            }
        }
    }
}

/// The main STT pipeline.
pub struct SttPipeline {
    /// Wrapped in `Option` so `stop()` can drop the sender, closing the
    /// channel and unblocking `blocking_recv()` in the pipeline thread.
    bytes_tx: Option<mpsc::Sender<PipelineMessage>>,
    cancel: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl SttPipeline {
    /// Start the STT pipeline.
    pub fn start(
        model_dir: &str,
        transcript_tx: mpsc::Sender<SttTranscript>,
    ) -> Result<Self, String> {
        let (bytes_tx, bytes_rx) = mpsc::channel::<PipelineMessage>(128);
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_clone = cancel.clone();
        let model_dir = model_dir.to_string();

        let handle = tokio::task::spawn_blocking(move || {
            run_pipeline(&model_dir, bytes_rx, transcript_tx, cancel_clone);
        });

        Ok(Self {
            bytes_tx: Some(bytes_tx),
            cancel,
            handle: Some(handle),
        })
    }

    /// Get the sender for injecting FLV bytes from the proxy.
    /// Panics if called after stop (bytes_tx already dropped).
    pub fn get_bytes_sender(&self) -> mpsc::Sender<PipelineMessage> {
        self.bytes_tx.as_ref().unwrap().clone()
    }

    /// Stop the pipeline.
    pub async fn stop(&mut self) {
        self.cancel.store(true, Ordering::Relaxed);
        // Drop our sender so the channel closes, unblocking blocking_recv().
        self.bytes_tx = None;
        if let Some(h) = self.handle.take() {
            let _ = h.await;
        }
    }
}

/// Main blocking loop: recv bytes → demux → decode → resample → recognize → emit.
fn run_pipeline(
    model_dir: &str,
    mut bytes_rx: mpsc::Receiver<PipelineMessage>,
    transcript_tx: mpsc::Sender<SttTranscript>,
    cancel: Arc<AtomicBool>,
) {
    let mut state = match PipelineState::new(Path::new(model_dir)) {
        Ok(s) => s,
        Err(e) => {
            log::error!("STT pipeline initialization failed: {e}");
            return;
        }
    };

    // Track the sample rate from the FLV demuxer to recreate resampler if needed
    let mut last_sample_rate: u32 = 48000;

    // Buffer for decoded f32 audio samples (before resampling)
    let mut f32_buffer: Vec<f32> = Vec::new();
    let mut chunk_count: u32 = 0;
    let mut last_transcript_text = String::new();

    // Audio timeline for caption alignment: cumulative 16kHz samples fed to
    // the recognizer, converted to ms. Reset on every tee stream switch.
    let mut audio_samples: u64 = 0;
    let mut epoch: u64 = 1;
    log::info!("STT pipeline: waiting for audio bytes...");

    loop {
        if cancel.load(Ordering::Relaxed) {
            break;
        }

        // Receive bytes or a stream-reset signal from the proxy (blocking)
        let bytes = match bytes_rx.blocking_recv() {
            Some(PipelineMessage::Bytes(b)) => b,
            Some(PipelineMessage::ResetStream) => {
                // New tee connection: restart the timeline so audioTsMs maps
                // onto the fresh stream the player is also starting from.
                epoch += 1;
                audio_samples = 0;
                f32_buffer.clear();
                state.flv_demuxer.reset();
                // Lazy-rebuild the AAC decoder from the new stream's header.
                state.aac_decoder = None;
                state.reset_stream();
                last_transcript_text.clear();
                log::info!("STT: tee stream switched, timeline reset (epoch {epoch})");
                continue;
            }
            None => break, // channel closed
        };

        // Feed to FLV demuxer
        let aac_frames = state.flv_demuxer.feed_bytes(bytes.as_ref());

        // Check if sample rate changed (from AAC sequence header)
        let current_sample_rate = state.flv_demuxer.sample_rate();
        if current_sample_rate != last_sample_rate {
            log::info!("STT: sample rate changed from {last_sample_rate} to {current_sample_rate}, recreating resampler");
            // Flush old resampler to avoid losing buffered samples (#11)
            let leftover = state.resampler.resample(&[], true);
            if !leftover.is_empty() {
                audio_samples += leftover.len() as u64;
                for ev in state.ingest(&leftover) {
                    let _ = transcript_tx.blocking_send(SttTranscript {
                        text: ev.text,
                        is_final: ev.is_final,
                        audio_ts_ms: (audio_samples * 1000 / TARGET_SAMPLE_RATE) as i64,
                        epoch,
                    });
                }
            }
            if let Some(new_resampler) = LinearResampler::create(current_sample_rate as i32, 16000) {
                state.resampler = new_resampler;
                last_sample_rate = current_sample_rate;
                // Adjust chunk size for new sample rate (~20ms chunks)
            } else {
                log::error!("STT: failed to create resampler for {current_sample_rate}Hz");
            }
        }

        // Chunk size: ~20ms of audio at the input sample rate
        let chunk_size = (current_sample_rate as usize * 20 / 1000) as usize; // e.g., 960 for 48kHz

        for frame in aac_frames {
            if cancel.load(Ordering::Relaxed) {
                break;
            }

            // Lazily create the persistent AAC decoder on first frame
            if state.aac_decoder.is_none() {
                let sr = state.flv_demuxer.sample_rate();
                let ch = state.flv_demuxer.channels();
                match AacDecoder::new(sr, ch) {
                    Ok(decoder) => {
                        log::info!("STT: AAC decoder initialized ({}Hz, {}ch)", sr, ch);
                        state.aac_decoder = Some(decoder);
                    }
                    Err(e) => {
                        log::warn!("STT: failed to init AAC decoder: {e}");
                        continue;
                    }
                }
            }

            // Decode AAC frame
            let f32_samples = match state.aac_decoder.as_mut() {
                Some(decoder) => decoder.decode_frame(&frame),
                None => continue,
            };

            match f32_samples {
                Ok(samples) => {
                    if !samples.is_empty() {
                        log::trace!("AAC decoded {} samples", samples.len());
                    }
                    if samples.is_empty() {
                        continue;
                    }
                    f32_buffer.extend_from_slice(&samples);

                    // Process in chunks of ~20ms
                    while f32_buffer.len() >= chunk_size {
                        // Use slice directly instead of drain().collect() to avoid
                        // per-chunk allocation (#10)
                        let resampled = state.resampler.resample(&f32_buffer[..chunk_size], false);
                        f32_buffer.drain(..chunk_size);

                        if !resampled.is_empty() {
                            // Log first few chunks for diagnostics
                            chunk_count += 1;
                            if chunk_count <= 3 {
                                log::info!("STT: chunk #{chunk_count} decoded {} samples → resampled {} samples",
                                    chunk_size, resampled.len());
                            }

                            // Feed to the engine and advance the audio timeline
                            audio_samples += resampled.len() as u64;
                            let audio_ts_ms = (audio_samples * 1000 / TARGET_SAMPLE_RATE) as i64;
                            let events = state.ingest(&resampled);
                            for ev in events {
                                if ev.is_final {
                                    log::info!("STT transcript (final): {}", ev.text);
                                }
                                last_transcript_text.clone_from(&ev.text);
                                let _ = transcript_tx.blocking_send(SttTranscript {
                                    text: ev.text,
                                    is_final: ev.is_final,
                                    audio_ts_ms,
                                    epoch,
                                });
                            }
                        }
                    }
                }
                Err(e) => {
                    log::trace!("AAC decode error: {e}");
                    let sr = state.flv_demuxer.sample_rate();
                    let ch = state.flv_demuxer.channels();
                    match AacDecoder::new(sr, ch) {
                        Ok(decoder) => {
                            state.aac_decoder = Some(decoder);
                            last_transcript_text.clear();
                            log::trace!("STT: AAC decoder reset after error");
                        }
                        Err(e) => {
                            state.aac_decoder = None;
                            last_transcript_text.clear();
                            log::warn!("STT: failed to reset AAC decoder: {e}");
                        }
                    }
                    continue;
                }
            }

            if state
                .aac_decoder
                .as_ref()
                .map_or(false, AacDecoder::should_recreate)
            {
                let sr = state.flv_demuxer.sample_rate();
                let ch = state.flv_demuxer.channels();
                match AacDecoder::new(sr, ch) {
                    Ok(decoder) => {
                        state.aac_decoder = Some(decoder);
                        last_transcript_text.clear();
                        log::trace!("STT: AAC decoder reset after consecutive decode errors");
                    }
                    Err(e) => {
                        state.aac_decoder = None;
                        last_transcript_text.clear();
                        log::warn!("STT: failed to reset AAC decoder: {e}");
                    }
                }
            }
        }
    }

    // Flush remaining buffered audio, then drain the engine
    if !f32_buffer.is_empty() {
        let resampled = state.resampler.resample(&f32_buffer, true);
        if !resampled.is_empty() {
            audio_samples += resampled.len() as u64;
            for ev in state.ingest(&resampled) {
                let _ = transcript_tx.blocking_send(SttTranscript {
                    text: ev.text,
                    is_final: ev.is_final,
                    audio_ts_ms: (audio_samples * 1000 / TARGET_SAMPLE_RATE) as i64,
                    epoch,
                });
            }
        }
    }
    for ev in state.flush() {
        let _ = transcript_tx.blocking_send(SttTranscript {
            text: ev.text,
            is_final: ev.is_final,
            audio_ts_ms: (audio_samples * 1000 / TARGET_SAMPLE_RATE) as i64,
            epoch,
        });
    }
}
