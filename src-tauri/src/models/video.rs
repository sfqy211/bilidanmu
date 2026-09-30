/// 听视频模式的数据模型：视频信息 / 分 P / 音频流 / 收藏夹
use serde::{Deserialize, Serialize};

/// 视频的一个分 P（听视频模式里的"一首歌"）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoPage {
    pub cid: u64,
    pub page: u32,
    pub part: String,
    pub duration: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub bvid: String,
    pub aid: u64,
    pub title: String,
    pub owner_name: String,
    pub owner_avatar: Option<String>,
    pub cover: Option<String>,
    pub duration: u64,
    pub pages: Vec<VideoPage>,
    /// 视频所属的合集/系列（联播用，可能为空）
    pub season: Option<SeasonInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonInfo {
    pub id: u64,
    pub title: String,
    pub episodes: Vec<SeasonEpisode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonEpisode {
    pub bvid: String,
    pub cid: u64,
    pub title: String,
    pub owner_name: String,
    pub cover: Option<String>,
    pub duration: u64,
}

/// 字幕行（听视频模式右侧字幕面板）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleLine {
    pub from: f64,
    pub to: f64,
    pub content: String,
}

/// 视频评论（只读）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoComment {
    pub rpid: u64,
    pub member_name: String,
    pub member_avatar: Option<String>,
    pub content: String,
    pub like: u64,
    pub ctime: i64,
    pub reply_count: u64,
    /// 当前用户是否已点赞（0 未点赞，>=1 已点赞；未登录恒为 0）
    #[serde(default)]
    pub action: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentPage {
    pub total: i64,
    pub list: Vec<VideoComment>,
}

/// 视频搜索结果（听视频模式的"搜索"页）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchVideoItem {
    pub bvid: String,
    pub title: String,
    pub author: String,
    pub cover: Option<String>,
    pub duration: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchVideoPage {
    pub total: i64,
    pub keyword: String,
    pub list: Vec<SearchVideoItem>,
}

/// 稍后再看条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchLaterItem {
    pub bvid: String,
    pub cid: u64,
    pub title: String,
    pub owner_name: String,
    pub cover: Option<String>,
    pub duration: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioStreamInfo {
    /// 本地代理 URL（Range/206 直通，可直接作为 audio src，支持拖动进度）
    pub url: String,
    pub codec: String,
}

/// 我创建的收藏夹（听视频模式里的"专辑列表"入口）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavFolder {
    pub id: u64,
    pub title: String,
    pub media_count: u64,
}

/// 收藏夹内的一个视频
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavResource {
    pub bvid: String,
    pub title: String,
    pub upper_name: String,
    pub cover: Option<String>,
    pub duration: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavResourcePage {
    pub total: i64,
    pub list: Vec<FavResource>,
}
