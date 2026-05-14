#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DanmakuEvent {
    pub id: String,
    pub room_id: u64,
    #[serde(rename = "type")]
    pub event_type: String,
    pub username: String,
    pub content: String,
    pub timestamp: u64,
    pub avatar: Option<String>,
    pub medal: Option<String>,
    pub uid: u64,
    pub color: u32,
    pub guard_level: u8,
    pub is_admin: bool,
    pub dm_type: u8,
    pub price: Option<u32>,
    pub gift_name: Option<String>,
    pub count: Option<u32>,
}
