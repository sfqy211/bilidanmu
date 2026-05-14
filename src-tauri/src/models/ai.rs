#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIModel {
    pub id: String,
    pub endpoint: String,
    pub model_name: String,
    pub notes: Option<String>,
    pub is_current: Option<bool>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIModelInput {
    pub endpoint: String,
    pub api_key: String,
    pub model_name: String,
    pub notes: Option<String>,
}

impl AIModel {
    pub fn from_input(id: &str, input: AIModelInput) -> Self {
        Self {
            id: id.into(),
            endpoint: input.endpoint,
            model_name: input.model_name,
            notes: input.notes,
            is_current: Some(true),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    pub success: bool,
    pub latency_ms: Option<u64>,
    pub message: Option<String>,
}
