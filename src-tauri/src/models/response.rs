#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BiliResponse {
    pub code: i32,
    pub message: String,
}
