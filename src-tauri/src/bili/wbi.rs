use md5::{Digest, Md5};
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

const MIXIN_KEY_ENC_TAB: [usize; 64] = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42,
    19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60,
    51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WbiKeys {
    pub img_key: String,
    pub sub_key: String,
}

impl WbiKeys {
    pub fn mixin_key(&self) -> String {
        get_mixin_key(&format!("{}{}", self.img_key, self.sub_key))
    }
}

pub fn get_mixin_key(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut mixed = String::with_capacity(32);

    for index in MIXIN_KEY_ENC_TAB.iter().take(32) {
        if let Some(byte) = bytes.get(*index) {
            mixed.push(*byte as char);
        }
    }

    mixed
}

pub fn sign_wbi(params: BTreeMap<String, String>, mixin_key: &str) -> BTreeMap<String, String> {
    let mut signed = params;
    let wts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string();

    signed.insert("wts".into(), wts);

    let query = signed
        .iter()
        .map(|(key, value)| {
            let filtered = filter_special_chars(value);
            format!("{}={}", encode_uri_component(key), encode_uri_component(&filtered))
        })
        .collect::<Vec<_>>()
        .join("&");

    let mut hasher = Md5::new();
    hasher.update(query.as_bytes());
    hasher.update(mixin_key.as_bytes());
    let w_rid = format!("{:x}", hasher.finalize());

    signed.insert("w_rid".into(), w_rid);
    signed
}

pub fn extract_wbi_key_from_url(url: &str) -> Option<String> {
    let file_name = url.rsplit('/').next()?;
    file_name.split('.').next().map(ToString::to_string)
}

fn filter_special_chars(value: &str) -> String {
    value
        .chars()
        .filter(|ch| !matches!(ch, '!' | '\'' | '(' | ')' | '*'))
        .collect()
}

fn encode_uri_component(input: &str) -> String {
    let mut output = String::with_capacity(input.len());

    for byte in input.bytes() {
        if matches!(byte, b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~') {
            output.push(byte as char);
        } else {
            output.push_str(&format!("%{:02X}", byte));
        }
    }

    output
}

#[cfg(test)]
mod tests {
    use super::{extract_wbi_key_from_url, get_mixin_key, sign_wbi};
    use std::collections::BTreeMap;

    #[test]
    fn should_extract_wbi_key() {
        let url = "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png";
        assert_eq!(
            extract_wbi_key_from_url(url).as_deref(),
            Some("7cd084941338484aae1ad9425b84077c")
        );
    }

    #[test]
    fn should_generate_mixin_key() {
        let img = "7cd084941338484aae1ad9425b84077c";
        let sub = "4932caff0ff746eab6f01bf08b70ac45";
        assert_eq!(
            get_mixin_key(&format!("{img}{sub}")),
            "ea1db124af3c7062474693fa704f4ff8"
        );
    }

    #[test]
    fn should_sign_params() {
        let mut params = BTreeMap::new();
        params.insert("foo".into(), "114".into());
        params.insert("bar".into(), "514".into());
        let signed = sign_wbi(params, "ea1db124af3c7062474693fa704f4ff8");

        assert!(signed.contains_key("wts"));
        assert!(signed.contains_key("w_rid"));
    }
}
