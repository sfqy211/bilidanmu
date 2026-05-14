#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Room {
    pub id: String,
    pub room_id: u64,
    pub uid: Option<u64>,
    pub title: String,
    pub uname: String,
    pub cover: Option<String>,
    pub is_live: bool,
    pub online: Option<u64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomInfo {
    #[serde(flatten)]
    pub room: Room,
    pub area_name: Option<String>,
    pub parent_area_name: Option<String>,
    pub description: Option<String>,
}

impl RoomInfo {
    pub fn mock(room_id: u64) -> Self {
        Self {
            room: Room {
                id: room_id.to_string(),
                room_id,
                uid: Some(12345678),
                title: "今晚继续冲！".into(),
                uname: "示例主播".into(),
                cover: None,
                is_live: true,
                online: Some(12000),
            },
            area_name: Some("原神".into()),
            parent_area_name: Some("手游".into()),
            description: Some("房间描述占位".into()),
        }
    }
}

impl From<RoomInfo> for Room {
    fn from(value: RoomInfo) -> Self {
        value.room
    }
}

impl From<RoomInfo> for SearchRoomResult {
    fn from(value: RoomInfo) -> Self {
        Self {
            room_id: value.room.room_id,
            uid: value.room.uid,
            uname: value.room.uname,
            title: value.room.title,
            cover: value.room.cover,
            is_live: value.room.is_live,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRoomResult {
    pub room_id: u64,
    pub uid: Option<u64>,
    pub uname: String,
    pub title: String,
    pub cover: Option<String>,
    pub is_live: bool,
}
