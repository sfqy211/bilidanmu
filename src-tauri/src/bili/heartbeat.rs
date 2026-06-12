use base64::Engine;
use indexmap::IndexMap;

use super::credential::BiliCredential;
use super::{sign_params_sorted, unix_secs, BILI_REFERER, APPKEY, APPSECRET};

const WEB_HEARTBEAT_URL: &str =
    "https://live-trace.bilibili.com/xlive/rdata-interface/v1/heartbeat/webHeartBeat";

const SECRET_KEY: &str = "axoaadsffcazxksectbbb";
const DEFAULT_AREA_ID: &str = "283";
const DEFAULT_PARENT_ID: &str = "6";
const DEFAULT_UP_LEVEL: &str = "40";
const DEFAULT_JUMP_FROM: &str = "30000";

/// 发送一次心跳（同时发送 Web 和移动端心跳）
///
/// 成功时返回服务端建议的下次心跳间隔（秒），失败返回默认 60。
pub async fn send_heartbeat(
    client: &reqwest::Client,
    credential: &BiliCredential,
    room_id: u64,
    up_id: u64,
    interval: u64,
    session_uuid: &str,
    click_id: &str,
    access_key: &str,
    buvid: &str,
    gu_id: &str,
    visit_id: &str,
) -> u64 {
    let cookie = credential.cookie_header();

    // === Web 心跳 ===
    let hb = base64::engine::general_purpose::STANDARD.encode(format!("{interval}|{room_id}|1|0"));
    let web_res = client
        .get(WEB_HEARTBEAT_URL)
        .header("Referer", BILI_REFERER)
        .header("Cookie", &cookie)
        .query(&[("hb", hb.as_str()), ("pf", "web")])
        .send()
        .await;
    match web_res {
        Ok(resp) => {
            let _ = resp.text().await;
        }
        Err(e) => log::warn!("[heartbeat:web] 请求失败: {e}"),
    }

    // === 移动端心跳 ===
    let now = unix_secs();
    let today_start = (now / 86400) * 86400;
    let timestamp = if now - 60 > today_start {
        now - 60
    } else {
        today_start
    };

    let mut data = IndexMap::new();
    data.insert("platform".to_string(), "android".to_string());
    data.insert("uuid".to_string(), session_uuid.to_string());
    data.insert("buvid".to_string(), buvid.to_string());
    data.insert("seq_id".to_string(), "1".to_string());
    data.insert("room_id".to_string(), room_id.to_string());
    data.insert("parent_id".to_string(), DEFAULT_PARENT_ID.to_string());
    data.insert("area_id".to_string(), DEFAULT_AREA_ID.to_string());
    data.insert("timestamp".to_string(), timestamp.to_string());
    data.insert("secret_key".to_string(), SECRET_KEY.to_string());
    data.insert("watch_time".to_string(), (now - timestamp).to_string());
    data.insert("up_id".to_string(), up_id.to_string());
    data.insert("up_level".to_string(), DEFAULT_UP_LEVEL.to_string());
    data.insert("jump_from".to_string(), DEFAULT_JUMP_FROM.to_string());
    data.insert("gu_id".to_string(), gu_id.to_string());
    data.insert("play_type".to_string(), "0".to_string());
    data.insert("play_url".to_string(), String::new());
    data.insert("s_time".to_string(), "0".to_string());
    data.insert("data_behavior_id".to_string(), String::new());
    data.insert("data_source_id".to_string(), String::new());
    data.insert(
        "up_session".to_string(),
        format!("l:one:live:record:{room_id}:{}", now - 88888),
    );
    data.insert("visit_id".to_string(), visit_id.to_string());
    data.insert(
        "watch_status".to_string(),
        "%7B%22pk_id%22%3A0%2C%22screen_status%22%3A1%7D".to_string(),
    );
    data.insert("click_id".to_string(), click_id.to_string());
    data.insert("session_id".to_string(), String::new());
    data.insert("player_type".to_string(), "0".to_string());
    data.insert("client_ts".to_string(), now.to_string());

    // client_sign（固定算法链：sha512→sha3_512→sha384→sha3_384→blake2b）
    let json_str = serde_json::to_string(&data).unwrap_or_default();
    let client_sign = compute_client_sign(&json_str);
    data.insert("client_sign".to_string(), client_sign);

    // app 签名参数
    data.insert("access_key".to_string(), access_key.to_string());
    data.insert("actionKey".to_string(), "appkey".to_string());
    data.insert("appkey".to_string(), APPKEY.to_string());
    data.insert("ts".to_string(), now.to_string());

    let sign = sign_params_sorted(&data.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect::<Vec<_>>(), APPSECRET);
    data.insert("sign".to_string(), sign);

    // 手动构建 form body（按 key 排序，与 sign 计算一致）
    let mut sorted_data: Vec<_> = data.iter().collect();
    sorted_data.sort_by(|a, b| a.0.cmp(b.0));
    let body = sorted_data
        .iter()
        .map(|(k, v)| format!("{}={}", super::py_quote_plus(k), super::py_quote_plus(v)))
        .collect::<Vec<_>>()
        .join("&");

    // 使用 raw TCP socket 发送（完全绕过 HTTP 库，与 Python raw socket 行为一致）
    let ua = "Mozilla/5.0 BiliDroid/7.80.0 (bbcallen@gmail.com) os/android model/MI 10 Pro mobi_app/android build/7800300 channel/xiaomi innerVer/7800310 osVer/14 network/2";
    let body_clone = body.clone();
    let mobile_text = tokio::task::spawn_blocking(move || {
        use std::io::{Read, Write};
        use std::net::{TcpStream, ToSocketAddrs};

        let host = "live-trace.bilibili.com";
        let port = 443;

        // TLS 连接（10 秒超时）
        let addr = match (host, port).to_socket_addrs() {
            Ok(mut addrs) => match addrs.next() {
                Some(a) => a,
                None => return "DNS 解析失败".to_string(),
            },
            Err(e) => return format!("DNS 解析失败: {e}"),
        };
        let tcp = match TcpStream::connect_timeout(&addr, std::time::Duration::from_secs(10)) {
            Ok(s) => s,
            Err(e) => return format!("TCP 连接失败: {e}"),
        };
        tcp.set_read_timeout(Some(std::time::Duration::from_secs(10))).ok();
        tcp.set_write_timeout(Some(std::time::Duration::from_secs(10))).ok();

        let connector = match native_tls::TlsConnector::new() {
            Ok(c) => c,
            Err(e) => return format!("TLS 初始化失败: {e}"),
        };
        let mut stream = match connector.connect(host, tcp) {
            Ok(s) => s,
            Err(e) => return format!("TLS 连接失败: {e}"),
        };

        // 构建 HTTP/1.1 请求
        let path = "/xlive/data-interface/v1/heartbeat/mobileHeartBeat";
        let request = format!(
            "POST {path} HTTP/1.1\r\n\
             Host: {host}\r\n\
             User-Agent: {ua}\r\n\
             Content-Type: application/x-www-form-urlencoded\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\
             \r\n\
             {}",
            body_clone.len(),
            body_clone
        );

        if let Err(e) = stream.write_all(request.as_bytes()) {
            return format!("发送失败: {e}");
        }

        // 读取响应
        let mut response = Vec::new();
        let _ = stream.read_to_end(&mut response);
        let resp_str = String::from_utf8_lossy(&response);

        // 提取 body（跳过 HTTP 头）
        match resp_str.find("\r\n\r\n") {
            Some(pos) => resp_str[pos + 4..].to_string(),
            None => resp_str.to_string(),
        }
    })
    .await
    .unwrap_or_else(|e| format!("任务失败: {e}"));

    if !mobile_text.contains("\"code\":0") {
        log::warn!("[heartbeat:mobile] room={room_id}, response={mobile_text}");
    }

    match serde_json::from_str::<serde_json::Value>(&mobile_text) {
        Ok(json) => json
            .get("data")
            .and_then(|d| d.get("next_interval"))
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(60),
        Err(_) => 60,
    }
}

/// 根据 Python 参考项目的固定算法链计算 client_sign
///
/// 固定链：sha512 → sha3_512 → sha384 → sha3_384 → blake2b
/// 与 Python `hashlib.new(n, _str.encode("utf-8")).hexdigest()` 行为一致
fn compute_client_sign(input: &str) -> String {
    use sha2::Digest;
    let mut s = input.to_string();
    // 固定算法链：sha512 → sha3_512 → sha384 → sha3_384 → blake2b
    // 与 fansMedalHelper 参考项目的 Python 实现一致
    for &algo in &[5u8, 7, 4, 9, 8] {
        s = match algo {
            5 => format!("{:x}", sha2::Sha512::digest(s.as_bytes())),
            7 => format!("{:x}", sha3::Sha3_512::digest(s.as_bytes())),
            4 => format!("{:x}", sha2::Sha384::digest(s.as_bytes())),
            9 => format!("{:x}", sha3::Sha3_384::digest(s.as_bytes())),
            8 => format!("{:x}", blake2::Blake2b512::digest(s.as_bytes())),
            _ => unreachable!(),
        };
    }
    s
}
