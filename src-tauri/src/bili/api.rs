use crate::bili::credential::BiliCredential;
use crate::bili::wbi::{extract_wbi_key_from_url, sign_wbi, WbiKeyCache, WbiKeys};
use crate::models::account::LoginStatus;
use crate::models::room::{Room, RoomInfo, SearchRoomResult};
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::Arc;
use tokio::sync::Mutex;

const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

#[derive(Clone)]
pub struct BiliApiClient {
    pub client: reqwest::Client,
    pub credential: Option<BiliCredential>,
    pub wbi_cache: Arc<Mutex<WbiKeyCache>>,
}

impl BiliApiClient {
    pub fn new(
        credential: Option<BiliCredential>,
        wbi_cache: Arc<Mutex<WbiKeyCache>>,
    ) -> Result<Self, reqwest::Error> {
        let client = reqwest::Client::builder().user_agent(USER_AGENT).build()?;

        Ok(Self {
            client,
            credential,
            wbi_cache,
        })
    }

    pub async fn nav(&self) -> Result<NavInfo, String> {
        let response = self
            .get_json("https://api.bilibili.com/x/web-interface/nav", None)
            .await?;

        ensure_success(&response)?;
        let data = response
            .get("data")
            .ok_or_else(|| "nav 接口缺少 data 字段".to_string())?;

        let wbi_img = data
            .get("wbi_img")
            .ok_or_else(|| "nav 接口缺少 wbi_img 字段".to_string())?;

        let img_url = get_str(wbi_img, "img_url")?;
        let sub_url = get_str(wbi_img, "sub_url")?;
        let keys = WbiKeys {
            img_key: extract_wbi_key_from_url(img_url)
                .ok_or_else(|| "无法解析 img_key".to_string())?,
            sub_key: extract_wbi_key_from_url(sub_url)
                .ok_or_else(|| "无法解析 sub_key".to_string())?,
        };

        {
            let mut cache = self.wbi_cache.lock().await;
            cache.store(keys.clone());
        }

        Ok(NavInfo {
            is_login: data.get("isLogin").and_then(Value::as_bool).unwrap_or(false),
            mid: data
                .get("mid")
                .and_then(value_as_u64)
                .or_else(|| data.get("mid").and_then(Value::as_str).and_then(|v| v.parse().ok())),
            uname: data.get("uname").and_then(Value::as_str).map(ToString::to_string),
            face: data.get("face").and_then(Value::as_str).map(ToString::to_string),
            wbi_keys: keys,
        })
    }

    pub async fn get_or_fetch_wbi_keys(&self) -> Result<WbiKeys, String> {
        if let Some(keys) = self.wbi_cache.lock().await.get_if_fresh() {
            return Ok(keys);
        }

        Ok(self.nav().await?.wbi_keys)
    }

    pub async fn get_room_info(&self, room_id: u64) -> Result<RoomInfo, String> {
        let response = self
            .get_json(
                "https://api.live.bilibili.com/room/v1/Room/get_info",
                Some(BTreeMap::from([("room_id".to_string(), room_id.to_string())])),
            )
            .await?;

        ensure_success(&response)?;
        let data = response
            .get("data")
            .ok_or_else(|| "直播间信息缺少 data 字段".to_string())?;

        let actual_room_id = data
            .get("room_id")
            .and_then(value_as_u64)
            .unwrap_or(room_id);

        Ok(RoomInfo {
            room: Room {
                id: actual_room_id.to_string(),
                room_id: actual_room_id,
                uid: data.get("uid").and_then(value_as_u64),
                title: data
                    .get("title")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                uname: data
                    .get("uname")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                cover: data
                    .get("user_cover")
                    .or_else(|| data.get("cover"))
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                is_live: data
                    .get("live_status")
                    .and_then(Value::as_u64)
                    .unwrap_or(0)
                    == 1,
                online: data.get("online").and_then(value_as_u64),
            },
            area_name: data
                .get("area_name")
                .or_else(|| data.get("area_v2_name"))
                .and_then(Value::as_str)
                .map(ToString::to_string),
            parent_area_name: data
                .get("parent_area_name")
                .or_else(|| data.get("area_v2_parent_name"))
                .and_then(Value::as_str)
                .map(ToString::to_string),
            description: data.get("description").and_then(Value::as_str).map(ToString::to_string),
        })
    }

    pub async fn get_danmu_info(&self, room_id: u64) -> Result<Value, String> {
        let keys = self.get_or_fetch_wbi_keys().await?;
        let signed = sign_wbi(
            BTreeMap::from([("id".to_string(), room_id.to_string())]),
            &keys.mixin_key(),
        );

        let response = self
            .get_json(
                "https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo",
                Some(signed),
            )
            .await?;

        ensure_success(&response)?;
        Ok(response)
    }

    pub async fn resolve_room_by_uid(&self, uid: u64) -> Result<SearchRoomResult, String> {
        let response = self
            .get_json(
                "https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids",
                Some(BTreeMap::from([("uids[]".to_string(), uid.to_string())])),
            )
            .await?;

        ensure_success(&response)?;
        let entry = response
            .get("data")
            .and_then(|data| data.get(uid.to_string()))
            .ok_or_else(|| "未找到该 UID 对应的直播间".to_string())?;

        Ok(SearchRoomResult {
            room_id: entry.get("room_id").and_then(value_as_u64).unwrap_or_default(),
            uid: entry.get("uid").and_then(value_as_u64),
            uname: entry
                .get("uname")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            title: entry
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            cover: entry.get("face").and_then(Value::as_str).map(ToString::to_string),
            is_live: entry.get("live_status").and_then(Value::as_u64).unwrap_or(0) == 1,
        })
    }

    pub async fn verify_login_status(&self) -> Result<LoginStatus, String> {
        let nav = self.nav().await?;

        Ok(LoginStatus {
            is_logged_in: nav.is_login,
            account: nav.mid.map(|mid| crate::models::account::Account {
                id: mid.to_string(),
                uid: mid,
                username: nav.uname.unwrap_or_else(|| "Bilibili 用户".to_string()),
                avatar: nav.face,
                cookie: self
                    .credential
                    .as_ref()
                    .map(BiliCredential::cookie_header)
                    .unwrap_or_default(),
                expires_at: None,
            }),
        })
    }

    async fn get_json(
        &self,
        url: &str,
        params: Option<BTreeMap<String, String>>,
    ) -> Result<Value, String> {
        let mut request = self.client.get(url).header("Referer", "https://www.bilibili.com/");

        if let Some(credential) = &self.credential {
            let cookie_header = credential.cookie_header();
            if !cookie_header.is_empty() {
                request = request.header("Cookie", cookie_header);
            }
        }

        if let Some(params) = params {
            request = request.query(&params);
        }

        let response = request.send().await.map_err(|error| error.to_string())?;
        response.json::<Value>().await.map_err(|error| error.to_string())
    }
}

#[derive(Debug, Clone)]
pub struct NavInfo {
    pub is_login: bool,
    pub mid: Option<u64>,
    pub uname: Option<String>,
    pub face: Option<String>,
    pub wbi_keys: WbiKeys,
}

fn ensure_success(response: &Value) -> Result<(), String> {
    let code = response.get("code").and_then(Value::as_i64).unwrap_or(-1);
    if code == 0 {
        Ok(())
    } else {
        Err(response
            .get("message")
            .or_else(|| response.get("msg"))
            .and_then(Value::as_str)
            .unwrap_or("Bilibili API 请求失败")
            .to_string())
    }
}

fn get_str<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("缺少字段: {key}"))
}

fn value_as_u64(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_i64().and_then(|number| u64::try_from(number).ok()))
}
