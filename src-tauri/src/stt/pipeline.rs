//! Main STT pipeline: FLV demux → AAC decode (symphonia) →
//! resample (sherpa-onnx LinearResampler) → sherpa-onnx OnlineRecognizer →
//! emit transcript events

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use bytes::Bytes;
use sherpa_onnx::{OnlineRecognizer, OnlineRecognizerConfig, OnlineStream, LinearResampler};
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

/// Find model files in the given directory.
fn find_model_files(model_dir: &str) -> Result<(String, String, String, String), String> {
    let dir = std::fs::read_dir(model_dir)
        .map_err(|e| format!("无法读取模型目录: {e}"))?;

    let mut encoder: Option<String> = None;
    let mut decoder: Option<String> = None;
    let mut joiner: Option<String> = None;
    let mut tokens: Option<String> = None;

    for entry in dir {
        let entry = entry.map_err(|e| format!("目录条目错误: {e}"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path().to_string_lossy().to_string();

        if name.starts_with("encoder") && name.ends_with(".onnx") {
            encoder = Some(path);
        } else if name.starts_with("decoder") && name.ends_with(".onnx") {
            decoder = Some(path);
        } else if name.starts_with("joiner") && name.ends_with(".onnx") {
            joiner = Some(path);
        } else if name == "tokens.txt" {
            tokens = Some(path);
        }
    }

    Ok((
        encoder.ok_or_else(|| "找不到 encoder 模型文件".to_string())?,
        decoder.ok_or_else(|| "找不到 decoder 模型文件".to_string())?,
        joiner.ok_or_else(|| "找不到 joiner 模型文件".to_string())?,
        tokens.ok_or_else(|| "找不到 tokens.txt 文件".to_string())?,
    ))
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

        let decoder_opts = AudioDecoderOptions::default();
        let decoder = symphonia::default::get_codecs()
            .make_audio_decoder(&audio_params, &decoder_opts)
            .map_err(|e| format!("创建 AAC 解码器失败: {e}"))?;

        Ok(Self {
            decoder,
            track_id: 1,
            channels: num_channels as usize,
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
                    extract_f32_samples(&audio_buf, self.channels, &mut all_samples);
                }
                Err(SymphoniaError::DecodeError(_)) => {}
                Err(_) => {}
            }

            pos += frame_len;
        }

        Ok(all_samples)
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

/// Pipeline configuration state, created once at start.
struct PipelineState {
    recognizer: OnlineRecognizer,
    stream: OnlineStream,
    resampler: LinearResampler,
    flv_demuxer: FlvDemuxer,
    aac_decoder: Option<AacDecoder>,
}

impl PipelineState {
    fn new(model_dir: &str) -> Result<Self, String> {
        let (encoder, decoder, joiner, tokens) = find_model_files(model_dir)?;

        let mut config = OnlineRecognizerConfig::default();
        config.model_config.transducer.encoder = Some(encoder);
        config.model_config.transducer.decoder = Some(decoder);
        config.model_config.transducer.joiner = Some(joiner);
        config.model_config.tokens = Some(tokens);
        config.enable_endpoint = true;
        config.decoding_method = Some("greedy_search".to_string());

        // Endpoint detection settings for streaming
        config.rule1_min_trailing_silence = 2.4;
        config.rule2_min_trailing_silence = 1.2;
        config.rule3_min_utterance_length = 20.0;

        let recognizer = OnlineRecognizer::create(&config)
            .ok_or_else(|| "创建 OnlineRecognizer 失败".to_string())?;

        let stream = recognizer.create_stream();

        // Resampler will be created with actual sample rate once the
        // first AAC sequence header is parsed by FlvDemuxer.
        // Default to 48000→16000 (most common for B站 live streams).
        let resampler = LinearResampler::create(48000, 16000)
            .ok_or_else(|| "创建 LinearResampler 失败".to_string())?;

        let flv_demuxer = FlvDemuxer::new();

        Ok(Self {
            recognizer,
            stream,
            resampler,
            flv_demuxer,
            aac_decoder: None,
        })
    }
}

/// The main STT pipeline.
pub struct SttPipeline {
    /// Wrapped in `Option` so `stop()` can drop the sender, closing the
    /// channel and unblocking `blocking_recv()` in the pipeline thread.
    bytes_tx: Option<mpsc::Sender<Bytes>>,
    cancel: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl SttPipeline {
    /// Start the STT pipeline.
    pub fn start(
        model_dir: &str,
        transcript_tx: mpsc::Sender<SttTranscript>,
    ) -> Result<Self, String> {
        let (bytes_tx, bytes_rx) = mpsc::channel::<Bytes>(128);
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
    pub fn get_bytes_sender(&self) -> mpsc::Sender<Bytes> {
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
    mut bytes_rx: mpsc::Receiver<Bytes>,
    transcript_tx: mpsc::Sender<SttTranscript>,
    cancel: Arc<AtomicBool>,
) {
    let mut state = match PipelineState::new(model_dir) {
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
    log::info!("STT pipeline: waiting for audio bytes...");

    loop {
        if cancel.load(Ordering::Relaxed) {
            break;
        }

        // Receive FLV bytes from the proxy (blocking)
        let bytes = match bytes_rx.blocking_recv() {
            Some(b) => b,
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
                state.stream.accept_waveform(16000, &leftover);
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

                            // Feed to sherpa-onnx
                            state.stream.accept_waveform(16000, &resampled);

                            while state.recognizer.is_ready(&state.stream) {
                                state.recognizer.decode(&state.stream);
                            }

                            // Get interim result
                            if let Some(result) = state.recognizer.get_result(&state.stream) {
                                if !result.text.is_empty() {
                                    let _ = transcript_tx.blocking_send(SttTranscript {
                                        text: result.text.clone(),
                                        is_final: result.is_final,
                                    });
                                }
                            }

                            // Check endpoint
                            if state.recognizer.is_endpoint(&state.stream) {
                                if let Some(result) = state.recognizer.get_result(&state.stream) {
                                    if !result.text.is_empty() {
                                        let _ = transcript_tx.blocking_send(SttTranscript {
                                            text: result.text,
                                            is_final: true,
                                        });
                                    }
                                }
                                state.recognizer.reset(&state.stream);
                            }
                        }
                    }
                }
                Err(e) => {
                    log::trace!("AAC decode error: {e}");
                }
            }
        }
    }

    // Flush remaining buffered audio
    if !f32_buffer.is_empty() {
        let resampled = state.resampler.resample(&f32_buffer, true);
        if !resampled.is_empty() {
            state.stream.accept_waveform(16000, &resampled);
            state.stream.input_finished();
            while state.recognizer.is_ready(&state.stream) {
                state.recognizer.decode(&state.stream);
            }
            if let Some(result) = state.recognizer.get_result(&state.stream) {
                if !result.text.is_empty() {
                    let _ = transcript_tx.blocking_send(SttTranscript {
                        text: result.text,
                        is_final: true,
                    });
                }
            }
        }
    }
}
