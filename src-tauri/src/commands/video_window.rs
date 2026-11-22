//! 视频弹幕窗口拥有独立的生命周期，音轨由主窗口统一持有。
//! 窗口壳（无边框/透明/置顶/吸附）与几何持久化与直播弹幕窗共用同一套实现；
//! 视频窗不使用「仅输入框」紧凑模式（该能力保留在共享的前端组件里）。
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow};

use crate::window_shell;
use crate::window_state as ws;

pub const LABEL: &str = "video-danmaku";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoTrack {
    key: String,
    title: String,
    bvid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackSnapshot {
    revision: u64,
    bvid: Option<String>,
    aid: Option<u64>,
    cid: Option<u64>,
    title: String,
    tracks: Vec<VideoTrack>,
    index: usize,
    playing: bool,
    loading: bool,
    current_time: f64,
    duration: f64,
    volume: f64,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", content = "value", rename_all = "camelCase")]
pub enum PlaybackAction {
    TogglePlay,
    Seek(f64),
    Volume(f64),
    SelectTrack(String),
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaybackRequest {
    bvid: Option<String>,
    cid: Option<u64>,
    control: PlaybackAction,
}

#[derive(Default)]
pub struct VideoWindowState {
    snapshot: Mutex<Option<PlaybackSnapshot>>,
    window_lock: tokio::sync::Mutex<()>,
}

fn video_window_title<'a>(app: &AppHandle, title: &'a str) -> &'a str {
    if title.trim().is_empty() {
        let state = app.state::<crate::AppState>();
        crate::settings_store::load_locale(state.inner()).messages().video_danmaku
    } else {
        title
    }
}

pub(crate) fn refresh_window_title(window: &WebviewWindow) -> tauri::Result<()> {
    let state = window.state::<VideoWindowState>();
    let title = state.snapshot.lock().unwrap_or_else(|error| error.into_inner())
        .as_ref().map(|snapshot| snapshot.title.clone()).unwrap_or_default();
    window.set_title(video_window_title(window.app_handle(), &title))
}

#[tauri::command]
pub fn publish_video_playback(
    window: WebviewWindow,
    app: AppHandle,
    snapshot: PlaybackSnapshot,
    state: State<'_, VideoWindowState>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("仅主窗口可以发布播放状态".into());
    }
    let mut current = state.snapshot.lock().map_err(|e| e.to_string())?;
    if current
        .as_ref()
        .is_some_and(|value| value.revision >= snapshot.revision)
    {
        return Ok(());
    }
    let title_changed = current
        .as_ref()
        .is_none_or(|value| value.title != snapshot.title);
    *current = Some(snapshot.clone());
    if let Some(window) = app.get_webview_window(LABEL) {
        if title_changed {
            let _ = window.set_title(video_window_title(&app, &snapshot.title));
        }
        window
            .emit("video-playback", &snapshot)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_video_playback(
    state: State<'_, VideoWindowState>,
) -> Result<Option<PlaybackSnapshot>, String> {
    Ok(state.snapshot.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub fn control_video_playback(
    app: AppHandle,
    bvid: Option<String>,
    cid: Option<u64>,
    control: PlaybackAction,
) -> Result<(), String> {
    app.emit_to(
        "main",
        "video-playback-control",
        PlaybackRequest { bvid, cid, control },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_video_danmaku_window(
    app: AppHandle,
    state: State<'_, VideoWindowState>,
) -> Result<(), String> {
    let _guard = state.window_lock.lock().await;
    let title = state.snapshot.lock().map_err(|e| e.to_string())?
        .as_ref().filter(|s| s.cid.is_some()).map(|s| s.title.clone())
        .ok_or("请等待视频解析完成")?;
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = refresh_window_title(&window);
        let _ = window.unminimize();
        window.show().map_err(|e| e.to_string())?;
        // 隐身态下唤出窗口必须显形并保持到光标进入一次，与直播弹幕窗一致
        // （window_stealth 按 label 分别判定，事件带 label 区分，前端不会串扰）
        crate::window_stealth::force_reveal(&app, LABEL);
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        // 与直播弹幕窗（create_danmaku_window）同一套几何恢复：尺寸/位置为上次落盘值。
        // 视频窗没有「仅输入框」形态：共享记录里的 input_only 标志属于直播窗的偏好，
        // 视频窗始终按完整尺寸创建。
        let saved = ws::load_geometry(&app, LABEL);
        let (w, h) = saved.size.unwrap_or((ws::VIDEO_DEFAULT_W, ws::VIDEO_DEFAULT_H));
        // 窗口壳与直播弹幕窗共用同一模板（无边框/透明/置顶/不进任务栏/后台节流开关）
        let builder = window_shell::build_shell_window(
            &app,
            LABEL,
            WebviewUrl::App("/video-danmaku".into()),
            video_window_title(&app, &title),
        )
        .map_err(|e| e.to_string())?
        .inner_size(w, h)
        .min_inner_size(ws::DANMAKU_MIN_W, ws::DANMAKU_MIN_H)
        .max_inner_size(ws::DANMAKU_MAX_W, ws::DANMAKU_MAX_H)
        .visible(false);
        let window = builder.build().map_err(|e| e.to_string())?;
        crate::brand_icon::apply_to_window(&app, &window);
        // 与直播弹幕窗同一套侧边吸附：贴边收缩、悬停展开、拖离退出
        crate::window_dock::attach(&window, &app);
        // 先隐藏创建并按保存值定位，再显示：不显式定位时 Windows 按级联规则摆放
        // 新窗口，每次重开都向右下偏移（与直播弹幕窗同一坑，见 create_danmaku_window）
        if let Some((x, y)) = saved.position {
            if ws::position_on_screen(&window, x, y) {
                let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
            }
        }
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
    Ok(())
}

#[tauri::command]
pub async fn close_video_danmaku_window(
    app: AppHandle,
    restore_main: Option<bool>,
    state: State<'_, VideoWindowState>,
) -> Result<(), String> {
    let _guard = state.window_lock.lock().await;
    let Some(window) = app.get_webview_window(LABEL) else {
        return Ok(());
    };
    if restore_main.unwrap_or(true) {
        if let Some(main) = app.get_webview_window("main") {
            main.show().map_err(|e| e.to_string())?;
            main.set_focus().map_err(|e| e.to_string())?;
        }
    }
    // 销毁前把当前几何落盘（Resized 防抖可能尚未写库），与直播弹幕窗退出路径一致
    ws::save_now(&app, LABEL);
    window.destroy().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::PlaybackAction;
    use serde_json::json;

    #[test]
    fn playback_actions_match_the_frontend_contract() {
        let actions = [
            json!({ "action": "togglePlay" }),
            json!({ "action": "seek", "value": 12.5 }),
            json!({ "action": "volume", "value": 40.0 }),
            json!({ "action": "selectTrack", "value": "BVtest:101#0" }),
        ];
        for value in actions {
            let action: PlaybackAction = serde_json::from_value(value.clone()).unwrap();
            assert_eq!(serde_json::to_value(action).unwrap(), value);
        }
    }
}
