use std::collections::BTreeMap;

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct BiliCredential {
    pub sessdata: Option<String>,
    pub bili_jct: Option<String>,
    pub buvid3: Option<String>,
    pub buvid4: Option<String>,
    pub dede_user_id: Option<String>,
    pub ac_time_value: Option<String>,
    pub raw_cookie: String,
}

impl BiliCredential {
    pub fn from_cookie_str(cookie: &str) -> Self {
        let mut map = BTreeMap::new();

        for part in cookie.split(';') {
            let trimmed = part.trim();
            if trimmed.is_empty() {
                continue;
            }

            let (key, value) = match trimmed.split_once('=') {
                Some((key, value)) => (key.trim(), value.trim()),
                None => continue,
            };

            if !key.is_empty() {
                map.insert(key.to_string(), value.to_string());
            }
        }

        Self {
            sessdata: map.get("SESSDATA").map(|value| normalize_sessdata(value)),
            bili_jct: map.get("bili_jct").cloned(),
            buvid3: map.get("buvid3").or_else(|| map.get("BUVID3")).cloned(),
            buvid4: map.get("buvid4").or_else(|| map.get("BUVID4")).cloned(),
            dede_user_id: map.get("DedeUserID").cloned(),
            ac_time_value: map.get("ac_time_value").cloned(),
            raw_cookie: cookie.trim().to_string(),
        }
    }

    pub fn has_sessdata(&self) -> bool {
        self.sessdata.as_deref().is_some_and(|value| !value.is_empty())
    }

    pub fn has_bili_jct(&self) -> bool {
        self.bili_jct.as_deref().is_some_and(|value| !value.is_empty())
    }

    pub fn csrf(&self) -> Option<&str> {
        self.bili_jct.as_deref()
    }

    pub fn cookie_map(&self) -> BTreeMap<&'static str, String> {
        let mut cookies = BTreeMap::new();

        if let Some(value) = &self.sessdata {
            cookies.insert("SESSDATA", value.clone());
        }
        if let Some(value) = &self.bili_jct {
            cookies.insert("bili_jct", value.clone());
        }
        if let Some(value) = &self.buvid3 {
            cookies.insert("buvid3", value.clone());
        }
        if let Some(value) = &self.buvid4 {
            cookies.insert("buvid4", value.clone());
        }
        if let Some(value) = &self.dede_user_id {
            cookies.insert("DedeUserID", value.clone());
        }
        if let Some(value) = &self.ac_time_value {
            cookies.insert("ac_time_value", value.clone());
        }

        cookies
    }

    pub fn cookie_header(&self) -> String {
        self.cookie_map()
            .into_iter()
            .map(|(key, value)| format!("{key}={value}"))
            .collect::<Vec<_>>()
            .join("; ")
    }

    pub fn validate_for_send(&self) -> Result<(), String> {
        if !self.has_sessdata() {
            return Err("Cookie 缺少 SESSDATA".to_string());
        }
        if !self.has_bili_jct() {
            return Err("Cookie 缺少 bili_jct".to_string());
        }
        Ok(())
    }
}

fn normalize_sessdata(value: &str) -> String {
    if value.contains('%') {
        value.to_string()
    } else {
        percent_encode(value)
    }
}

fn percent_encode(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    for byte in input.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            output.push(byte as char);
        } else {
            output.push_str(&format!("%{:02X}", byte));
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use super::BiliCredential;

    #[test]
    fn parse_cookie_string() {
        let credential = BiliCredential::from_cookie_str(
            "SESSDATA=test,1; bili_jct=csrf123; DedeUserID=42; buvid3=abc;",
        );

        assert_eq!(credential.sessdata.as_deref(), Some("test%2C1"));
        assert_eq!(credential.bili_jct.as_deref(), Some("csrf123"));
        assert_eq!(credential.dede_user_id.as_deref(), Some("42"));
    }
}
