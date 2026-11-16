//! 视频弹幕窗口拥有独立的生命周期和几何，音轨由主窗口统一持有。
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

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
    full_size: Mutex<Option<tauri::LogicalSize<f64>>>,
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
            let _ = window.set_title(&snapshot.title);
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
    if state
        .snapshot
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .and_then(|s| s.cid)
        .is_none()
    {
        return Err("请等待视频解析完成".into());
    }
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.unminimize();
        window.show().map_err(|e| e.to_string())?;
        window
            .emit("video-window-reveal", ())
            .map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        let builder =
            WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("/video-danmaku".into()))
                .title("视频弹幕")
                .inner_size(440.0, 680.0)
                .min_inner_size(360.0, 320.0)
                .decorations(false)
                .transparent(true)
                .shadow(false)
                .skip_taskbar(true)
                .always_on_top(true)
                .maximizable(false)
                .visible(false);
        #[cfg(target_os = "windows")]
        let builder = builder.additional_browser_args(concat!(
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,IntensiveWakeUpThrottling",
            " --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding",
        ));
        let window = builder.build().map_err(|e| e.to_string())?;
        window.on_window_event({
            let window = window.clone();
            move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        });
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
    window.destroy().map_err(|e| e.to_string())?;
    *state.full_size.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[tauri::command]
pub fn set_video_input_only(
    app: AppHandle,
    enabled: bool,
    state: State<'_, VideoWindowState>,
) -> Result<bool, String> {
    let window = app.get_webview_window(LABEL).ok_or("视频弹幕窗口不存在")?;
    let mut saved = state.full_size.lock().map_err(|e| e.to_string())?;
    if enabled == saved.is_some() {
        return Ok(enabled);
    }
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let logical = |v: f64| tauri::PixelUnit::Logical(tauri::LogicalUnit::new(v));
    let constraints_for = |compact: bool| tauri::WindowSizeConstraints {
        min_width: Some(logical(if compact { 240.0 } else { 360.0 })),
        min_height: Some(logical(if compact { 48.0 } else { 320.0 })),
        max_width: compact.then(|| logical(520.0)),
        max_height: compact.then(|| logical(48.0)),
    };
    let full_size = tauri::LogicalSize::new(size.width as f64 / scale, size.height as f64 / scale);
    let target = if enabled {
        tauri::LogicalSize::new(full_size.width.clamp(240.0, 520.0), 48.0)
    } else {
        *saved.as_ref().ok_or("缺少完整窗口尺寸")?
    };
    let target_width = (target.width * scale).round() as i32;
    let target_height = (target.height * scale).round() as i32;
    let y = position.y + size.height as i32 - target_height;
    let (x, y) = crate::window_state::clamp_into_work_area(
        &window,
        position.x,
        y,
        target_width,
        target_height,
    );
    let apply = || -> tauri::Result<()> {
        window.set_size_constraints(constraints_for(enabled))?;
        window.set_size(target)?;
        window.set_position(tauri::PhysicalPosition::new(x, y))?;
        Ok(())
    };
    if let Err(error) = apply() {
        // 任一步失败都恢复旧几何与约束，保持前端模式和原生窗口一致。
        let _ = window.set_size_constraints(constraints_for(saved.is_some()));
        let _ = window.set_size(size);
        let _ = window.set_position(position);
        return Err(error.to_string());
    }
    *saved = enabled.then_some(full_size);
    Ok(enabled)
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
