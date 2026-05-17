//! Streaming Speech-to-Text (STT) module using sherpa-onnx.
//!
//! Pipeline: FLV bytes from proxy → FLV demux → AAC decode (symphonia)
//! → resample (sherpa-onnx LinearResampler) → sherpa-onnx OnlineRecognizer
//! → emit transcript events to frontend.

pub mod flv_demux;
pub mod pipeline;

use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use crate::proxy::stream_proxy::StreamProxyServer;

/// A recognized transcript segment.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SttTranscript {
    pub text: String,
    pub is_final: bool,
}

/// Manages the STT pipeline lifecycle.
pub struct SttManager {
    pipeline: Option<pipeline::SttPipeline>,
    transcript_handle: Option<tokio::task::JoinHandle<()>>,
    cancel: Arc<std::sync::atomic::AtomicBool>,
    stream_proxy: Arc<StreamProxyServer>,
}

impl SttManager {
    /// Start the STT pipeline with the given model directory.
    ///
    /// `model_dir` should contain: encoder*.onnx, decoder*.onnx, joiner*.onnx, tokens.txt
    pub async fn start(
        model_dir: String,
        app_handle: AppHandle,
        stream_proxy: Arc<StreamProxyServer>,
    ) -> Result<Self, String> {
        // Create channel for transcripts (pipeline → emit loop)
        let (transcript_tx, mut transcript_rx) = mpsc::channel::<SttTranscript>(128);

        // Create and start the pipeline (this also creates the bytes channel)
        let pipeline = pipeline::SttPipeline::start(&model_dir, transcript_tx)?;

        // Get the bytes sender for the proxy to tee into
        let bytes_sender = pipeline.get_bytes_sender();

        // Inject the bytes sender into the stream proxy
        stream_proxy
            .set_stt_sender(Some(bytes_sender))
            .await
            .map_err(|e| format!("注入 STT 发送器失败: {e}"))?;

        // Spawn a tokio task to emit transcript events to the frontend
        let cancel = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let cancel_clone = cancel.clone();

        let transcript_handle = tokio::spawn(async move {
            log::info!("STT transcript emit loop started");
            loop {
                tokio::select! {
                    biased;
                    _ = tokio::time::sleep(std::time::Duration::from_millis(100)), if cancel_clone.load(std::sync::atomic::Ordering::Relaxed) => {
                        log::info!("STT transcript emit loop cancelled");
                        break;
                    }
                    msg = transcript_rx.recv() => {
                        match msg {
                            Some(transcript) => {
                                log::trace!("STT transcript: {} (final={})", transcript.text, transcript.is_final);
                                let _ = app_handle.emit("stt-transcript", transcript);
                            }
                            None => {
                                log::info!("STT transcript channel closed");
                                break;
                            }
                        }
                    }
                }
            }
        });

        Ok(Self {
            pipeline: Some(pipeline),
            transcript_handle: Some(transcript_handle),
            cancel,
            stream_proxy,
        })
    }

    /// Stop the pipeline and cleanup.
    pub async fn stop(&mut self) -> Result<(), String> {
        // Signal cancel
        self.cancel.store(true, std::sync::atomic::Ordering::Relaxed);

        // Clear the STT sender from the proxy
        self.stream_proxy.set_stt_sender(None).await?;

        // Stop the pipeline
        if let Some(mut pipeline) = self.pipeline.take() {
            pipeline.stop().await;
        }

        // Wait for the transcript emit handle
        if let Some(handle) = self.transcript_handle.take() {
            handle.abort();
            let _ = handle.await;
        }

        Ok(())
    }
}
