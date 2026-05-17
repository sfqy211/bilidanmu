use std::sync::Arc;
use tokio::sync::{Mutex as TokioMutex, OnceCell, mpsc};
use tokio::net::TcpListener;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use http_body_util::{BodyExt, Full, StreamBody, combinators::BoxBody};
use hyper::body::{Bytes, Frame, Incoming};
use futures_util::StreamExt;

/// 运行时的流代理状态（端口 + 共享 URL + STT 发送器）
pub struct StreamProxyState {
    stream_url: Arc<TokioMutex<Option<String>>>,
    port: u16,
    /// #15: `stt_sender` is `Arc<Mutex<Option<...>>>` — the outer Arc is shared
    /// between StreamProxyServer and StreamProxyState (cloned into each hyper
    /// connection), while the inner Mutex protects the Option that is swapped
    /// when STT starts/stops. This double-indirection is necessary because:
    /// 1. The Arc allows cheap cloning for each HTTP connection handler.
    /// 2. The Mutex allows the sender to be swapped atomically from any task.
    /// 3. The Option allows clearing the sender when STT stops.
    stt_sender: Arc<TokioMutex<Option<mpsc::Sender<Bytes>>>>,
}

/// 惰性启动的本地 HTTP 流代理服务器
///
/// 在首次 IPC 调用时才绑定端口和启动 hyper 服务，
/// 避免在 `manage()` 阶段执行异步初始化。
#[derive(Clone)]
pub struct StreamProxyServer {
    state: OnceCell<Arc<StreamProxyState>>,
    proxy_client: reqwest::Client,
    stt_sender: Arc<TokioMutex<Option<mpsc::Sender<Bytes>>>>,
}

impl StreamProxyServer {
    pub fn new(proxy_client: reqwest::Client) -> Self {
        Self {
            state: OnceCell::new(),
            proxy_client,
            stt_sender: Arc::new(TokioMutex::new(None)),
        }
    }

    /// 绑定 127.0.0.1:0、启动 hyper 服务，返回 StreamProxyState（包装在 Arc 中）
    async fn start_inner(
        proxy_client: reqwest::Client,
        stt_sender: Arc<TokioMutex<Option<mpsc::Sender<Bytes>>>>,
    ) -> Result<Arc<StreamProxyState>, String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("流代理服务器绑定失败: {e}"))?;

        let port = listener
            .local_addr()
            .map_err(|e| format!("获取流代理端口失败: {e}"))?
            .port();

        let stream_url: Arc<TokioMutex<Option<String>>> = Arc::new(TokioMutex::new(None));
        let stream_url_clone = stream_url.clone();
        let proxy_client_clone = proxy_client.clone();
        let stt_sender_clone = stt_sender.clone();

        tokio::spawn(async move {
            loop {
                let (tcp_stream, _) = match listener.accept().await {
                    Ok(s) => s,
                    Err(e) => {
                        log::error!("流代理 accept 错误: {e}");
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                        continue;
                    }
                };

                let io = TokioIo::new(tcp_stream);
                let stream_url = stream_url_clone.clone();
                let proxy_client = proxy_client_clone.clone();
                let stt_sender = stt_sender_clone.clone();

                tokio::spawn(async move {
                    let service = service_fn(move |req: Request<Incoming>| {
                        let stream_url = stream_url.clone();
                        let proxy_client = proxy_client.clone();
                        let stt_sender = stt_sender.clone();
                        async move {
                            handle_proxy_request(req, stream_url, proxy_client, stt_sender).await
                        }
                    });

                    if let Err(err) = http1::Builder::new()
                        .serve_connection(io, service)
                        .await
                    {
                        log::trace!("流代理连接结束: {err}");
                    }
                });
            }
        });

        let state = StreamProxyState {
            stream_url,
            port,
            stt_sender,
        };

        Ok(Arc::new(state))
    }

    /// 确保服务器已启动（惰性初始化）
    async fn ensure_started(&self) -> Result<Arc<StreamProxyState>, String> {
        let stt_sender = self.stt_sender.clone();
        let proxy_client = self.proxy_client.clone();
        self.state
            .get_or_try_init(|| Self::start_inner(proxy_client, stt_sender))
            .await
            .map(Arc::clone)
    }

    /// 设置当前要代理的 CDN 流 URL
    pub async fn set_stream_url(&self, url: String) -> Result<(), String> {
        let state = self.ensure_started().await?;
        *state.stream_url.lock().await = Some(url);
        Ok(())
    }

    /// 清除当前流 URL
    pub async fn clear_stream_url(&self) -> Result<(), String> {
        if let Some(state) = self.state.get() {
            *state.stream_url.lock().await = None;
        }
        Ok(())
    }

    /// 设置 STT 字节发送器（从 SttManager 注入）
    pub async fn set_stt_sender(&self, sender: Option<mpsc::Sender<Bytes>>) -> Result<(), String> {
        let state = self.ensure_started().await?;
        *state.stt_sender.lock().await = sender;
        Ok(())
    }

    /// 获取本地代理 URL
    pub async fn proxy_url(&self) -> Result<String, String> {
        let state = self.ensure_started().await?;
        Ok(format!("http://127.0.0.1:{}/live-audio", state.port))
    }
}

// ── HTTP 请求处理 ──────────────────────────────────────────

fn full_body(data: impl Into<Bytes>) -> BoxBody<Bytes, std::io::Error> {
    Full::new(data.into())
        .map_err(|e| -> std::io::Error { match e {} })
        .boxed()
}

async fn handle_proxy_request(
    req: Request<Incoming>,
    stream_url: Arc<TokioMutex<Option<String>>>,
    proxy_client: reqwest::Client,
    stt_sender: Arc<TokioMutex<Option<mpsc::Sender<Bytes>>>>,
) -> Result<Response<BoxBody<Bytes, std::io::Error>>, std::io::Error> {
    // CORS preflight
    if req.method() == Method::OPTIONS {
        return Ok(Response::builder()
            .status(StatusCode::NO_CONTENT)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, OPTIONS")
            .header("Access-Control-Allow-Headers", "Range")
            .header("Access-Control-Max-Age", "86400")
            .body(full_body(Bytes::new()))
            .unwrap());
    }

    if req.method() != Method::GET || req.uri().path() != "/live-audio" {
        return Ok(Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header("Access-Control-Allow-Origin", "*")
            .body(full_body("Not Found"))
            .unwrap());
    }

    let url = stream_url.lock().await.clone();
    let url = match url {
        Some(u) => u,
        None => {
            return Ok(Response::builder()
                .status(StatusCode::SERVICE_UNAVAILABLE)
                .header("Access-Control-Allow-Origin", "*")
                .body(full_body("No stream URL configured"))
                .unwrap());
        }
    };

    let response = match proxy_client
        .get(&url)
        .header("Referer", "https://www.bilibili.com/")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return Ok(Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .header("Access-Control-Allow-Origin", "*")
                .body(full_body(format!("CDN request failed: {e}")))
                .unwrap());
        }
    };

    if !response.status().is_success() {
        return Ok(Response::builder()
            .status(StatusCode::BAD_GATEWAY)
            .header("Access-Control-Allow-Origin", "*")
            .body(full_body(format!("CDN returned: {}", response.status())))
            .unwrap());
    }

    // 将 reqwest 字节流 → hyper Body 流，同时 tee 到 STT 管道
    let stream = response.bytes_stream().map(move |result: Result<Bytes, reqwest::Error>| {
        match result {
            Ok(bytes) => {
                // Tee to STT pipeline (Bytes::clone is reference-counted, zero-copy)
                if let Ok(guard) = stt_sender.try_lock() {
                    if let Some(sender) = guard.as_ref() {
                        let _ = sender.try_send(bytes.clone());
                    }
                }
                Ok(Frame::data(bytes))
            }
            Err(e) => Err(std::io::Error::new(std::io::ErrorKind::Other, e)),
        }
    });

    let body = BodyExt::boxed(StreamBody::new(stream));

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "audio/x-flv")
        .header("Cache-Control", "no-cache")
        .header("Access-Control-Allow-Origin", "*")
        .body(body)
        .unwrap())
}
