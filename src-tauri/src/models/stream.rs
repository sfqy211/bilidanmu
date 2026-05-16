#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    pub current_qn: u64,
    pub accept_qn: Vec<u64>,
    pub base_url: String,
    pub url_info: Vec<UrlInfo>,
    /// 完整 CDN 流 URL: host + base_url + extra
    pub stream_url: String,
    /// 本地代理 URL: http://127.0.0.1:{PORT}/live-audio
    pub proxy_url: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlInfo {
    pub host: String,
    pub extra: String,
}
