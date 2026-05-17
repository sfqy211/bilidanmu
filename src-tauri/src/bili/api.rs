use crate::bili::credential::BiliCredential;
use crate::bili::wbi::{extract_wbi_key_from_url, sign_wbi, WbiKeyCache, WbiKeys};
use crate::models::account::LoginStatus;
use crate::models::response::BiliResponse;
use crate::models::room::{Emoticon, EmoticonPackage, Room, RoomInfo, SearchRoomResult};
use crate::models::stream::{StreamInfo, UrlInfo};
use regex::Regex;
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct BiliApiClient {
    pub client: reqwest::Client,
    pub credential: Option<BiliCredential>,
    pub wbi_cache: Arc<Mutex<WbiKeyCache>>,
}

impl BiliApiClient {
    pub fn new(
        client: reqwest::Client,
        credential: Option<BiliCredential>,
        wbi_cache: Arc<Mutex<WbiKeyCache>>,
    ) -> Self {
        Self {
            client,
            credential,
            wbi_cache,
        }
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
        let uid = data.get("uid").and_then(value_as_u64);

        let mut uname = data
            .get("uname")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();

        // /room/v1/Room/get_info 不返回 uname，通过 uid 补充获取
        if uname.is_empty() {
            if let Some(uid) = uid {
                uname = self.fetch_uname(uid).await.unwrap_or_default();
            }
        }

        Ok(RoomInfo {
            room: Room {
                id: actual_room_id.to_string(),
                room_id: actual_room_id,
                uid,
                title: data
                    .get("title")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                uname,
                cover: data
                    .get("user_cover")
                    .or_else(|| data.get("cover"))
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
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
            is_live: data
                .get("live_status")
                .and_then(Value::as_u64)
                .unwrap_or(0)
                == 1,
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

    /// 批量查询多个 UID 的直播状态
    ///
    /// 返回 `HashMap<uid, is_live>`，未查到的 UID 不包含在结果中。
    pub async fn get_rooms_live_status(
        &self,
        uids: &[u64],
    ) -> Result<std::collections::HashMap<u64, bool>, String> {
        if uids.is_empty() {
            return Ok(std::collections::HashMap::new());
        }

        // BTreeMap 不支持重复 key，手动拼接 uids[] 参数
        let query = uids
            .iter()
            .map(|uid| format!("uids[]={uid}"))
            .collect::<Vec<_>>()
            .join("&");
        let url = format!(
            "https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids?{query}"
        );

        let response = self.get_json(&url, None).await?;
        ensure_success(&response)?;

        let data = response
            .get("data")
            .and_then(Value::as_object)
            .ok_or_else(|| "get_status_info_by_uids 响应缺少 data".to_string())?;

        let mut result = std::collections::HashMap::new();
        for (uid_str, entry) in data {
            if let Ok(uid) = uid_str.parse::<u64>() {
                let is_live = entry
                    .get("live_status")
                    .and_then(Value::as_u64)
                    .unwrap_or(0)
                    == 1;
                result.insert(uid, is_live);
            }
        }

        Ok(result)
    }

    pub async fn search_rooms_by_name(&self, keyword: &str, page: u32) -> Result<Vec<SearchRoomResult>, String> {
        let response = self
            .get_json(
                "https://api.bilibili.com/x/web-interface/search/type",
                Some(BTreeMap::from([
                    ("search_type".to_string(), "live".to_string()),
                    ("cover_type".to_string(), "user_cover".to_string()),
                    ("order".to_string(), "".to_string()),
                    ("keyword".to_string(), keyword.to_string()),
                    ("category_id".to_string(), "".to_string()),
                    ("__refresh__".to_string(), "".to_string()),
                    ("_extra".to_string(), "".to_string()),
                    ("highlight".to_string(), "0".to_string()),
                    ("single_column".to_string(), "0".to_string()),
                    ("page".to_string(), page.to_string()),
                ])),
            )
            .await?;

        ensure_success(&response)?;
        let items = response
            .get("data")
            .and_then(|data| data.get("result"))
            .and_then(|result| result.get("live_room"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        Ok(items
            .iter()
            .filter_map(|item| {
                let room_id = item.get("roomid").and_then(value_as_u64)?;
                let uname = item.get("uname").and_then(Value::as_str).unwrap_or_default();
                let title = item.get("title").and_then(Value::as_str).unwrap_or_default();
                let cover = item.get("cover").and_then(Value::as_str).map(normalize_cover_url);

                Some(SearchRoomResult {
                    room_id,
                    uid: item.get("uid").and_then(value_as_u64),
                    uname: strip_em_tags(uname),
                    title: strip_em_tags(title),
                    cover,
                    is_live: item.get("live_status").and_then(Value::as_u64).unwrap_or(0) == 1,
                })
            })
            .collect())
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

    /// 通过 uid 获取主播名
    async fn fetch_uname(&self, uid: u64) -> Option<String> {
        let response = self
            .get_json(
                "https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids",
                Some(BTreeMap::from([("uids[]".to_string(), uid.to_string())])),
            )
            .await
            .ok()?;

        response
            .get("data")
            .and_then(|data| data.get(uid.to_string()))
            .and_then(|entry| entry.get("uname"))
            .and_then(Value::as_str)
            .map(ToString::to_string)
    }

    pub async fn get_emoticons(&self, room_id: u64) -> Result<Vec<EmoticonPackage>, String> {
        let response = self
            .get_json(
                "https://api.live.bilibili.com/xlive/web-ucenter/v2/emoticon/GetEmoticons",
                Some(BTreeMap::from([
                    ("platform".to_string(), "pc".to_string()),
                    ("room_id".to_string(), room_id.to_string()),
                ])),
            )
            .await?;

        ensure_success(&response)?;

        let packages = response
            .get("data")
            .and_then(|data| data.get("data"))
            .and_then(Value::as_array)
            .ok_or_else(|| "表情列表缺少 data.data 字段".to_string())?;

        packages
            .iter()
            .map(parse_emoticon_package)
            .collect::<Result<Vec<_>, _>>()
    }

    /// 调用 v2 播放 API 获取直播流信息
    ///
    /// `only_audio=true` 时请求纯音频流（FLV 内仅含 AAC 音频轨）。
    /// 返回扁平化的 StreamInfo，内部导航 `stream[0].format[0].codec[0]`。
    pub async fn get_room_play_info(
        &self,
        room_id: u64,
        only_audio: bool,
    ) -> Result<StreamInfo, String> {
        let keys = self.get_or_fetch_wbi_keys().await?;

        let mut params = BTreeMap::from([
            ("room_id".to_string(), room_id.to_string()),
            ("protocol".to_string(), "0".to_string()),
            ("format".to_string(), "0".to_string()),
            ("codec".to_string(), "0,1".to_string()),
            ("qn".to_string(), "150".to_string()),
            ("platform".to_string(), "web".to_string()),
            ("ptype".to_string(), "8".to_string()),
            ("dolby".to_string(), "5".to_string()),
            ("panorama".to_string(), "1".to_string()),
        ]);

        if only_audio {
            params.insert("only_audio".to_string(), "1".to_string());
        }

        let signed = sign_wbi(params, &keys.mixin_key());

        let response = self
            .get_json(
                "https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo",
                Some(signed),
            )
            .await?;

        ensure_success(&response)?;

        // 导航: data.playurl_info.playurl.stream[0].format[0].codec[0]
        let codec = response
            .get("data")
            .and_then(|v| v.get("playurl_info"))
            .and_then(|v| v.get("playurl"))
            .and_then(|v| v.get("stream"))
            .and_then(Value::as_array)
            .and_then(|arr| arr.first())
            .and_then(|s| s.get("format"))
            .and_then(Value::as_array)
            .and_then(|arr| arr.first())
            .and_then(|f| f.get("codec"))
            .and_then(Value::as_array)
            .and_then(|arr| arr.first())
            .ok_or_else(|| "v2 API 响应中缺少流信息".to_string())?;

        let current_qn = codec
            .get("current_qn")
            .and_then(value_as_u64)
            .unwrap_or(150);
        let accept_qn = codec
            .get("accept_qn")
            .and_then(Value::as_array)
            .map(|arr| arr.iter().filter_map(value_as_u64).collect())
            .unwrap_or_default();
        let base_url = codec
            .get("base_url")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let url_info: Vec<UrlInfo> = codec
            .get("url_info")
            .and_then(Value::as_array)
            .map(|arr| arr.iter().filter_map(parse_url_info).collect())
            .unwrap_or_default();

        // 完整流 URL: host + base_url + extra
        let stream_url = if let Some(info) = url_info.first() {
            format!("{}{}{}", info.host, base_url, info.extra)
        } else {
            base_url.clone()
        };

        Ok(StreamInfo {
            current_qn,
            accept_qn,
            base_url,
            url_info,
            stream_url,
            proxy_url: String::new(), // 由 IPC 命令填充
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

    async fn post_form(
        &self,
        url: &str,
        form: &BTreeMap<String, String>,
    ) -> Result<Value, String> {
        let mut request = self
            .client
            .post(url)
            .header("Referer", "https://www.bilibili.com/");

        if let Some(credential) = &self.credential {
            let cookie_header = credential.cookie_header();
            if !cookie_header.is_empty() {
                request = request.header("Cookie", cookie_header);
            }
        }

        let response = request
            .form(form)
            .send()
            .await
            .map_err(|error| error.to_string())?;

        response.json::<Value>().await.map_err(|error| error.to_string())
    }

    pub async fn send_danmaku(
        &self,
        room_id: u64,
        msg: &str,
        color: Option<u32>,
        mode: Option<u32>,
        dm_type: u32,
        emoticon_options: Option<String>,
    ) -> Result<BiliResponse, String> {
        let credential = self
            .credential
            .as_ref()
            .ok_or_else(|| "未登录，无法发送弹幕".to_string())?;

        credential.validate_for_send()?;
        let csrf = credential
            .csrf()
            .ok_or_else(|| "Cookie 缺少 bili_jct".to_string())?;
        let rnd = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .to_string();

        let mut form = BTreeMap::from([
            ("roomid".to_string(), room_id.to_string()),
            ("msg".to_string(), msg.to_string()),
            ("color".to_string(), color.unwrap_or(16_777_215).to_string()),
            ("fontsize".to_string(), "25".to_string()),
            ("mode".to_string(), mode.unwrap_or(1).to_string()),
            ("rnd".to_string(), rnd),
            ("bubble".to_string(), "0".to_string()),
            ("csrf".to_string(), csrf.to_string()),
            ("csrf_token".to_string(), csrf.to_string()),
            ("dm_type".to_string(), dm_type.to_string()),
        ]);

        if dm_type == 0 {
            form.insert("room_type".to_string(), "0".to_string());
        }

        if dm_type == 1 {
            form.insert(
                "data_extend".to_string(),
                serde_json::json!({"trackid": "-99998"}).to_string(),
            );
            form.insert(
                "emoticon_options".to_string(),
                emoticon_options.unwrap_or_else(|| "{}".to_string()),
            );
        }

        let response = self
            .post_form("https://api.live.bilibili.com/msg/send", &form)
            .await?;

        let code = response.get("code").and_then(Value::as_i64).unwrap_or(-1) as i32;
        let message = response
            .get("message")
            .or_else(|| response.get("msg"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();

        if code == 0 {
            Ok(BiliResponse { code, message })
        } else {
            Err(if message.is_empty() {
                format!("发送弹幕失败，错误码 {code}")
            } else {
                format!("{message}（错误码 {code}）")
            })
        }
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

fn strip_em_tags(input: &str) -> String {
    Regex::new(r"</?em[^>]*>")
        .map(|regex| regex.replace_all(input, "").to_string())
        .unwrap_or_else(|_| input.to_string())
}

fn normalize_cover_url(input: &str) -> String {
    let url = strip_em_tags(input);
    if url.starts_with("http://") || url.starts_with("https://") {
        url
    } else if url.starts_with("//") {
        format!("https:{url}")
    } else {
        format!("https://{url}")
    }
}

fn parse_emoticon_package(value: &Value) -> Result<EmoticonPackage, String> {
    Ok(EmoticonPackage {
        pkg_id: value.get("pkg_id").and_then(value_as_u64).unwrap_or_default(),
        pkg_name: value
            .get("pkg_name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        pkg_type: value.get("pkg_type").and_then(value_as_u64),
        current_cover: value
            .get("current_cover")
            .and_then(Value::as_str)
            .map(normalize_cover_url),
        emoticons: value
            .get("emoticons")
            .and_then(Value::as_array)
            .map(|items| items.iter().map(parse_emoticon).collect::<Result<Vec<_>, _>>())
            .transpose()?
            .unwrap_or_default(),
    })
}

fn parse_emoticon(value: &Value) -> Result<Emoticon, String> {
    let url = value
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| "表情缺少 url 字段".to_string())?;

    Ok(Emoticon {
        emoji: value.get("emoji").and_then(Value::as_str).map(ToString::to_string),
        descript: value
            .get("descript")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        url: normalize_cover_url(url),
        perm: value.get("perm").and_then(value_as_u64),
        emoticon_unique: value
            .get("emoticon_unique")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        emoticon_id: value.get("emoticon_id").and_then(value_as_u64),
        pkg_id: value.get("pkg_id").and_then(value_as_u64),
        height: value.get("height").and_then(value_as_u64),
        width: value.get("width").and_then(value_as_u64),
        is_dynamic: value.get("is_dynamic").and_then(value_as_u64),
        unlock_show_text: value
            .get("unlock_show_text")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        emoticon_options: value.get("emoticon_options").cloned(),
    })
}

fn parse_url_info(value: &Value) -> Option<UrlInfo> {
    Some(UrlInfo {
        host: value.get("host").and_then(Value::as_str)?.to_string(),
        extra: value.get("extra").and_then(Value::as_str)?.to_string(),
    })
}
