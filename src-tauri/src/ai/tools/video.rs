//! 视频工具：搜索、详情、字幕、评论、收藏夹、稍后再看、播放/点赞/评论。

use super::{api_with_main, args};
use crate::ai::spec::ToolError;
use crate::ai::tools::classify_business_error;
use crate::AppState;
use tauri::Manager;

/// 关键词搜索视频。
pub async fn search(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let keyword = args::string(raw, "keyword")?;
    if keyword.trim().is_empty() {
        return Err(ToolError::invalid_args("keyword 不能为空"));
    }
    let page = args::capped(raw, "page", 1, 1, 50) as u32;

    let api = api_with_main(state).await;
    let result = api
        .search_videos(keyword.trim(), page)
        .await
        .map_err(classify_business_error)?;
    serde_json::to_value(result).map_err(|error| ToolError::failed(format!("序列化搜索结果失败: {error}")))
}

/// 视频详情（含 cid，后续字幕/音频都要用）。
pub async fn get_info(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let bvid = args::string(raw, "bvid")?;
    let api = api_with_main(state).await;
    let info = api
        .get_video_info(&bvid)
        .await
        .map_err(classify_business_error)?;
    serde_json::to_value(info).map_err(|error| ToolError::failed(format!("序列化视频信息失败: {error}")))
}

/// 字幕内容。不传 cid 时先查详情拿 cid。
pub async fn get_subtitle(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let bvid = args::string(raw, "bvid")?;
    let api = api_with_main(state).await;

    let cid = match args::opt_u64(raw, "cid") {
        Some(cid) => cid,
        None => {
            let info = api
                .get_video_info(&bvid)
                .await
                .map_err(classify_business_error)?;
            info.pages
                .first()
                .map(|page| page.cid)
                .ok_or_else(|| ToolError::failed("该视频没有分P信息，无法确定 cid"))?
        }
    };

    let lines = api
        .get_video_subtitle(&bvid, cid)
        .await
        .map_err(classify_business_error)?;

    Ok(serde_json::json!({
        "bvid": bvid,
        "cid": cid,
        "count": lines.len(),
        "lines": lines,
    }))
}

/// 一级评论列表。
pub async fn get_comments(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let bvid = args::string(raw, "bvid")?;
    let page = args::capped(raw, "page", 1, 1, 200) as u32;
    // 0 = 按时间，1 = 按热度（B 站 sort 参数语义）
    let sort = args::capped(raw, "sort", 1, 0, 1) as u32;

    let api = api_with_main(state).await;
    let info = api
        .get_video_info(&bvid)
        .await
        .map_err(classify_business_error)?;
    let comments = api
        .get_video_comments(info.aid, page, sort)
        .await
        .map_err(classify_business_error)?;

    serde_json::to_value(comments).map_err(|error| ToolError::failed(format!("序列化评论失败: {error}")))
}

/// 楼中楼回复。
pub async fn get_replies(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let bvid = args::string(raw, "bvid")?;
    let root = args::u64_required(raw, "root")?;
    let page = args::capped(raw, "page", 1, 1, 200) as u32;

    let api = api_with_main(state).await;
    let info = api
        .get_video_info(&bvid)
        .await
        .map_err(classify_business_error)?;
    let replies = api
        .get_comment_replies(info.aid, root, page)
        .await
        .map_err(classify_business_error)?;

    serde_json::to_value(replies).map_err(|error| ToolError::failed(format!("序列化回复失败: {error}")))
}

/// 收藏夹列表（需登录）。
pub async fn fav_folders(
    _app: &tauri::AppHandle,
    state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let mid = current_uid(state).await.ok_or_else(ToolError::not_logged_in)?;
    let api = api_with_main(state).await;
    let folders = api
        .list_fav_folders(mid)
        .await
        .map_err(classify_business_error)?;
    Ok(serde_json::json!({ "count": folders.len(), "folders": folders }))
}

/// 收藏夹内容。
pub async fn fav_list(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let media_id = args::u64_required(raw, "mediaId")?;
    let page = args::capped(raw, "page", 1, 1, 200) as u32;
    let size = args::capped(raw, "size", 20, 1, 50) as u32;

    let api = api_with_main(state).await;
    let resources = api
        .list_fav_resources(media_id, page, size)
        .await
        .map_err(classify_business_error)?;
    serde_json::to_value(resources)
        .map_err(|error| ToolError::failed(format!("序列化收藏内容失败: {error}")))
}

/// 稍后再看列表（需登录）。
pub async fn watch_later(
    _app: &tauri::AppHandle,
    state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let api = api_with_main(state).await;
    let items = api
        .list_watch_later()
        .await
        .map_err(classify_business_error)?;
    Ok(serde_json::json!({ "count": items.len(), "items": items }))
}

/// 在桌面端播放一个视频（切换到视频外壳，不下载）。
pub async fn play(
    app: &tauri::AppHandle,
    _state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let bvid = args::string(raw, "bvid")?;
    if bvid.trim().is_empty() {
        return Err(ToolError::invalid_args("bvid 不能为空"));
    }

    // 路由归前端管：主窗口收到事件后自己 navigate，Rust 不直接改 URL
    use tauri::{Emitter, Manager};
    let _ = app.emit_to(
        "main",
        "ai-navigate",
        serde_json::json!({ "path": format!("/listen/video/{}", bvid.trim()) }),
    );
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }

    Ok(serde_json::json!({ "playing": true, "bvid": bvid.trim() }))
}

/// 停止当前视频音频。
pub async fn stop(
    app: &tauri::AppHandle,
    state: &AppState,
    _raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    crate::commands::video::stop_video_audio(app.state::<AppState>())
        .await
        .map_err(classify_business_error)?;
    let _ = state;
    Ok(serde_json::json!({ "stopped": true }))
}

/// 点赞或取消点赞评论。
pub async fn like_comment(
    app: &tauri::AppHandle,
    _state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let oid = args::u64_required(raw, "oid")?;
    let rpid = args::u64_required(raw, "rpid")?;
    let like = args::bool_or(raw, "like", true);

    crate::commands::video::like_comment(oid, rpid, like, app.state::<AppState>())
        .await
        .map_err(classify_business_error)?;

    Ok(serde_json::json!({ "oid": oid, "rpid": rpid, "liked": like }))
}

/// 发表评论（`root`/`parent` 非空时为楼中楼回复）。
pub async fn post_comment(
    app: &tauri::AppHandle,
    _state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    let oid = args::u64_required(raw, "oid")?;
    let message = args::string(raw, "message")?;
    if message.trim().is_empty() {
        return Err(ToolError::invalid_args("评论内容不能为空"));
    }
    let root = args::opt_u64(raw, "root");
    let parent = args::opt_u64(raw, "parent");

    let comment = crate::commands::video::add_video_comment(
        oid,
        message,
        root,
        parent,
        app.state::<AppState>(),
    )
    .await
    .map_err(classify_business_error)?;

    serde_json::to_value(comment)
        .map_err(|error| ToolError::failed(format!("序列化评论结果失败: {error}")))
}

async fn current_uid(state: &AppState) -> Option<u64> {
    state
        .credential
        .lock()
        .await
        .as_ref()
        .and_then(|credential| credential.dede_user_id.as_deref())
        .and_then(|value| value.parse::<u64>().ok())
}
