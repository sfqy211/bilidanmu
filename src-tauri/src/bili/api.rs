use crate::bili::credential::BiliCredential;

pub struct BiliApiClient {
    pub client: reqwest::Client,
    pub credential: Option<BiliCredential>,
}

impl BiliApiClient {
    pub fn new(credential: Option<BiliCredential>) -> Result<Self, reqwest::Error> {
        let client = reqwest::Client::builder()
            .user_agent("BiliDanmu/0.1.0")
            .build()?;

        Ok(Self { client, credential })
    }

    pub fn with_credential(mut self, credential: BiliCredential) -> Self {
        self.credential = Some(credential);
        self
    }
}
