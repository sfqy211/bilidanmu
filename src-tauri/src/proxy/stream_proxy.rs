use std::sync::Arc;
use tokio::sync::{Mutex as TokioMutex, OnceCell};
use tokio::net::TcpListener;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use http_body_util::{BodyExt, Full, StreamBody, combinators::BoxBody};
use hyper::body::{Bytes, Frame, Incoming};
use futures_util::StreamExt;

/// 运行时的流代理状态（端口 + 共享 URL）
pub struct StreamProxyState {
    stream_url: Arc<TokioMutex<Option<String>>>,
    port: u16,
}

/// 惰性启动的本地 HTTP 流代理服务器
///
/// 在首次 IPC 调用时才绑定端口和启动 hyper 服务，
/// 避免在 `manage()` 阶段执行异步初始化。
pub struct StreamProxyServer {
    state: OnceCell<StreamProxyState>,
    proxy_client: reqwest::Client,
}

impl StreamProxyServer {
    pub fn new(proxy_client: reqwest::Client) -> Self {
        Self {
            state: OnceCell::new(),
            proxy_client,
        }
    }

    /// 绑定 127.0.0.1:0、启动 hyper 服务，返回 StreamProxyState
    async fn start_inner(proxy_client: reqwest::Client) -> Result<StreamProxyState, String> {
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

                tokio::spawn(async move {
                    let service = service_fn(move |req: Request<Incoming>| {
                        let stream_url = stream_url.clone();
                        let proxy_client = proxy_client.clone();
                        async move {
                            handle_proxy_request(req, stream_url, proxy_client).await
                        }
                    });

                    if let Err(err) = http1::Builder::new()
                        .serve_connection(io, service)
                        .await
                    {
                        log::debug!("流代理连接结束: {err}");
                    }
                });
            }
        });

        Ok(StreamProxyState { stream_url, port })
    }

    /// 确保服务器已启动（惰性初始化）
    async fn ensure_started(&self) -> Result<&StreamProxyState, String> {
        self.state
            .get_or_try_init(|| Self::start_inner(self.proxy_client.clone()))
            .await
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

    // 将 reqwest 字节流 → hyper Body 流
    let stream = response.bytes_stream().map(|result: Result<Bytes, reqwest::Error>| {
        result
            .map(|bytes| Frame::data(bytes))
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
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
