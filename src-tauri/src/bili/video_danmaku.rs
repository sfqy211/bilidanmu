//! 视频弹幕分段接口。字段号来自 bilibili community.service.dm.v1.DanmakuElem。
use super::api::BiliApiClient;
use super::wbi::sign_wbi;
use crate::models::video::VideoDanmaku;
use prost::Message;
use std::collections::BTreeMap;

#[derive(Clone, PartialEq, Message)]
struct DanmakuSegment {
    #[prost(message, repeated, tag = "1")]
    elems: Vec<DanmakuElem>,
}

#[derive(Clone, PartialEq, Message)]
struct DanmakuElem {
    #[prost(int64, tag = "1")]
    id: i64,
    #[prost(int32, tag = "2")]
    progress: i32,
    #[prost(int32, tag = "3")]
    mode: i32,
    #[prost(string, tag = "7")]
    content: String,
    #[prost(string, tag = "12")]
    id_str: String,
}

impl BiliApiClient {
    pub async fn get_video_danmaku(
        &self,
        cid: u64,
        segment: u32,
    ) -> Result<Vec<VideoDanmaku>, String> {
        let keys = self.get_or_fetch_wbi_keys().await?;
        let params = sign_wbi(
            BTreeMap::from([
                ("type".into(), "1".into()),
                ("oid".into(), cid.to_string()),
                ("segment_index".into(), segment.to_string()),
            ]),
            &keys.mixin_key(),
        );
        let response = self
            .client
            .get("https://api.bilibili.com/x/v2/dm/wbi/web/seg.so")
            .header("Referer", super::BILI_REFERER)
            .header(
                "Cookie",
                self.credential
                    .clone()
                    .unwrap_or_else(super::credential::BiliCredential::anonymous)
                    .cookie_header(),
            )
            .query(&params)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        // 部分错误以 JSON 返回，必须作为失败展示，避免误报为「没有弹幕」。
        if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&bytes) {
            return Err(json
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("读取视频弹幕失败")
                .into());
        }
        let decoded =
            DanmakuSegment::decode(bytes).map_err(|e| format!("弹幕数据解析失败: {e}"))?;
        let mut result: Vec<_> = decoded
            .elems
            .into_iter()
            .filter(|item| (1..=6).contains(&item.mode) && !item.content.is_empty())
            .map(|item| VideoDanmaku {
                id: if item.id_str.is_empty() {
                    item.id.to_string()
                } else {
                    item.id_str
                },
                progress: item.progress.max(0) as f64 / 1000.0,
                content: item.content,
            })
            .collect();
        result.sort_by(|a, b| a.progress.total_cmp(&b.progress));
        Ok(result)
    }
}
