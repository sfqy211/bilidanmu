#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub uid: u64,
    pub username: String,
    pub avatar: Option<String>,
    pub cookie: String,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Credential {
    pub account_id: String,
    pub uid: u64,
    pub username: String,
    pub avatar: Option<String>,
    pub cookie: String,
    pub bili_jct: Option<String>,
}

impl Credential {
    pub fn mock() -> Self {
        Self {
            account_id: "mock-account".into(),
            uid: 10001,
            username: "示例用户".into(),
            avatar: None,
            cookie: "SESSDATA=mock; bili_jct=mock;".into(),
            bili_jct: Some("mock".into()),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginStatus {
    pub is_logged_in: bool,
    pub account: Option<Account>,
}
