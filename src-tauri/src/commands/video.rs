use crate::commands::build_api_client;
use crate::models::video::{
    AudioStreamInfo, CommentPage, FavFolder, FavResourcePage, SearchVideoPage, SubtitleLine,
    VideoComment, VideoInfo, WatchLaterItem,
};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_video_danmaku(
    cid: u64,
    segment: u32,
    state: State<'_, AppState>,
) -> Result<Vec<crate::models::video::VideoDanmaku>, String> {
    if cid == 0 || segment == 0 {
        return Err("无效的视频弹幕分段".into());
    }
    let credential = state.credential.lock().await.clone();
    build_api_client(credential, &state)
        .get_video_danmaku(cid, segment)
        .await
}

#[tauri::command]
pub async fn send_video_danmaku(
    bvid: String,
    cid: u64,
    message: String,
    progress: f64,
    state: State<'_, AppState>,
) -> Result<crate::models::video::VideoDanmaku, String> {
    let message = message.trim();
    if message.is_empty() || message.chars().count() > 100 {
        return Err("弹幕长度应为 1–100 个字符".into());
    }
    if cid == 0 || !progress.is_finite() || progress < 0.0 {
        return Err("无效的视频播放位置".into());
    }
    let credential = crate::commands::get_sending_credential(&state).await;
    build_api_client(credential, &state)
        .send_video_danmaku(&bvid, cid, message, (progress * 1000.0).round() as u64)
        .await
}

/// 从稍后再看移除视频（`aid` 为视频 avid，列表接口里带）
#[tauri::command]
pub async fn remove_watch_later(aid: u64, state: State<'_, AppState>) -> Result<(), String> {
    if aid == 0 {
        return Err("无效的视频 aid".into());
    }
    let credential = state.credential.lock().await.clone();
    build_api_client(credential, &state)
        .remove_watch_later(aid)
        .await
}

/// 视频信息（标题、UP 主、分 P 列表）
#[tauri::command]
pub async fn get_video_info(bvid: String, state: State<'_, AppState>) -> Result<VideoInfo, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state);
    api.get_video_info(&bvid).await
}

/// 解析视频音频流并注册到本地代理，返回可直接作为 audio src 的本地 URL。
/// 只同时注册一条音轨（单播放语义），再次调用即覆盖。
#[tauri::command]
pub async fn get_video_audio(
    bvid: String,
    cid: u64,
    state: State<'_, AppState>,
) -> Result<AudioStreamInfo, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state);
    let (cdn_url, codec) = api.get_video_audio_url(&bvid, cid).await?;
    state
        .stream_proxy
        .set_vod_stream_url(cdn_url)
        .await?;
    let url = state.stream_proxy.vod_proxy_url().await?;
    Ok(AudioStreamInfo { url, codec })
}

/// 停止音频代理（mini 播放条关闭时调用）
#[tauri::command]
pub async fn stop_video_audio(state: State<'_, AppState>) -> Result<(), String> {
    state.stream_proxy.clear_vod_stream_url().await
}

/// 我创建的收藏夹列表（需登录）
#[tauri::command]
pub async fn list_fav_folders(state: State<'_, AppState>) -> Result<Vec<FavFolder>, String> {
    let credential = state.credential.lock().await.clone();
    let mid: u64 = credential
        .as_ref()
        .and_then(|c| c.dede_user_id.as_deref())
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| "未登录，无法获取收藏夹".to_string())?;
    let api = build_api_client(credential, &state);
    api.list_fav_folders(mid).await
}

/// 收藏夹内视频（分页）
#[tauri::command]
pub async fn list_fav_resources(
    media_id: u64,
    page: Option<u32>,
    size: Option<u32>,
    state: State<'_, AppState>,
) -> Result<FavResourcePage, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state);
    api.list_fav_resources(media_id, page.unwrap_or(1).max(1), size.unwrap_or(20).clamp(1, 50))
        .await
}

/// 视频字幕（CC 全文，可能为空）
#[tauri::command]
pub async fn get_video_subtitle(
    bvid: String,
    cid: u64,
    state: State<'_, AppState>,
) -> Result<Vec<SubtitleLine>, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state);
    api.get_video_subtitle(&bvid, cid).await
}

/// 视频评论（只读，分页）。sort：0 按时间，1 按点赞
#[tauri::command]
pub async fn get_video_comments(
    aid: u64,
    page: Option<u32>,
    sort: Option<u32>,
    state: State<'_, AppState>,
) -> Result<CommentPage, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state);
    api.get_video_comments(aid, page.unwrap_or(1).max(1), sort.unwrap_or(1))
        .await
}

/// 搜索视频（分页）
#[tauri::command]
pub async fn search_videos(
    keyword: String,
    page: Option<u32>,
    state: State<'_, AppState>,
) -> Result<SearchVideoPage, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state);
    api.search_videos(&keyword, page.unwrap_or(1).max(1)).await
}

/// 点赞/取消点赞评论（需登录）
#[tauri::command]
pub async fn like_comment(
    oid: u64,
    rpid: u64,
    like: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let credential = state.credential.lock().await.clone();
    let csrf = credential
        .as_ref()
        .and_then(|c| c.bili_jct.clone())
        .ok_or_else(|| "未登录，无法点赞".to_string())?;
    let api = build_api_client(credential, &state);
    api.like_reply(oid, rpid, like, &csrf).await
}

/// 发表评论（需登录）。root 非空时为楼中楼回复；parent 为直接父评论（回复子评论时与 root 不同）
#[tauri::command]
pub async fn add_video_comment(
    oid: u64,
    message: String,
    root: Option<u64>,
    parent: Option<u64>,
    state: State<'_, AppState>,
) -> Result<VideoComment, String> {
    let credential = state.credential.lock().await.clone();
    let csrf = credential
        .as_ref()
        .and_then(|c| c.bili_jct.clone())
        .ok_or_else(|| "未登录，无法评论".to_string())?;
    if message.trim().is_empty() {
        return Err("评论内容不能为空".to_string());
    }
    let api = build_api_client(credential, &state);
    api.add_video_comment(oid, message.trim(), root, parent, &csrf).await
}

/// 评论的子评论（楼中楼，分页）
#[tauri::command]
pub async fn get_comment_replies(
    oid: u64,
    root: u64,
    page: Option<u32>,
    state: State<'_, AppState>,
) -> Result<CommentPage, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state);
    api.get_comment_replies(oid, root, page.unwrap_or(1).max(1))
        .await
}

/// 稍后再看列表（只读）
#[tauri::command]
pub async fn list_watch_later(state: State<'_, AppState>) -> Result<Vec<WatchLaterItem>, String> {
    let credential = state.credential.lock().await.clone();
    let api = build_api_client(credential, &state);
    api.list_watch_later().await
}
