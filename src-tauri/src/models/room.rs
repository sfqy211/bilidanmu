#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Room {
    pub id: String,
    pub room_id: u64,
    pub uid: Option<u64>,
    pub title: String,
    pub uname: String,
    pub cover: Option<String>,
    pub avatar: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomInfo {
    #[serde(flatten)]
    pub room: Room,
    pub area_name: Option<String>,
    pub parent_area_name: Option<String>,
    pub description: Option<String>,
    pub is_live: bool,
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
                avatar: None,
            },
            area_name: Some("原神".into()),
            parent_area_name: Some("手游".into()),
            description: Some("房间描述占位".into()),
            is_live: true,
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
            avatar: value.room.avatar,
            is_live: value.is_live,
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
    pub avatar: Option<String>,
    pub is_live: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmoticonPackage {
    pub pkg_id: u64,
    pub pkg_name: String,
    pub pkg_type: Option<u64>,
    pub current_cover: Option<String>,
    #[serde(default)]
    pub emoticons: Vec<Emoticon>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Emoticon {
    pub emoji: Option<String>,
    pub descript: Option<String>,
    pub url: String,
    pub perm: Option<u64>,
    pub emoticon_unique: Option<String>,
    pub emoticon_id: Option<u64>,
    pub pkg_id: Option<u64>,
    pub height: Option<u64>,
    pub width: Option<u64>,
    #[serde(default)]
    pub is_dynamic: Option<u64>,
    #[serde(default)]
    pub unlock_show_text: Option<String>,
    #[serde(default)]
    pub emoticon_options: Option<serde_json::Value>,
}
