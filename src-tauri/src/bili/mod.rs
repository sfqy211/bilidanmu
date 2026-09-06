pub mod api;
pub mod buvid;
pub mod credential;
pub mod heartbeat;
pub mod mock;
pub mod protocol;
pub mod wbi;
pub mod ws_client;

/// Bilibili Android app key
pub const APPKEY: &str = "4409e2ce8ffd12b8";
/// Bilibili Android app secret
pub const APPSECRET: &str = "59b43e04ad6965f34319062b478f83dd";
/// Bilibili 站 Referer
pub const BILI_REFERER: &str = "https://www.bilibili.com/";

/// 当前 Unix 时间戳（秒）
pub fn unix_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Python 兼容的 URL 编码（quote_plus 行为：空格→+，其余特殊字符用 %XX）
pub fn py_quote_plus(input: &str) -> String {
    let mut output = String::with_capacity(input.len() * 3);
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'_' | b'.' | b'-' | b'~' => {
                output.push(byte as char);
            }
            b' ' => output.push('+'),
            _ => output.push_str(&format!("%{byte:02X}")),
        }
    }
    output
}

/// 对参数按 key 排序、URL 编码拼接，附加 secret 后计算 MD5 签名。
///
/// 编码规则：空格→`+`，`A-Za-z0-9_.-~` 保留，其余用 `%XX`（大写十六进制）。
/// 注意：与 `url::form_urlencoded` 的差异在于 `~` 不编码、`*` 会编码。
pub fn sign_params_sorted(params: &[(&str, &str)], secret: &str) -> String {
    use md5::Digest;
    let mut sorted: Vec<_> = params.iter().collect();
    sorted.sort_by(|a, b| a.0.cmp(&b.0));
    let query = sorted
        .iter()
        .map(|(k, v)| format!("{}={}", py_quote_plus(k), py_quote_plus(v)))
        .collect::<Vec<_>>()
        .join("&");
    let digest = md5::Md5::digest(format!("{query}{secret}").as_bytes());
    format!("{:x}", digest)
}
