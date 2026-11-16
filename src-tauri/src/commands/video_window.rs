//! 视频弹幕窗口拥有独立的生命周期，音轨由主窗口统一持有。
//! 几何持久化与「仅输入框」切换复用直播弹幕窗的 window_state 机制（按 label 分键存储），
//! 仅输入框切换逻辑与 commands/room.rs 的 apply_input_only 同构。
use serde::{Deserialize, Serialize};
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

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
        // 隐身态下唤出窗口必须显形并保持到光标进入一次，与直播弹幕窗一致
        // （window_stealth 按 label 分别判定，事件带 label 区分，前端不会串扰）
        crate::window_stealth::force_reveal(&app, LABEL);
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        // 与直播弹幕窗（create_danmaku_window）同一套几何恢复：尺寸/位置为上次落盘值，
        // 仅输入框按紧凑约束创建（高度锁定），无保存值回退各自默认尺寸。
        let saved = ws::load_geometry(&app, LABEL);
        let input_only = saved.input_only;
        app.state::<crate::AppState>()
            .video_input_only
            .store(input_only, Ordering::Relaxed);
        let (w, h, min_w, min_h, max_w, max_h) = if input_only {
            let width = saved
                .input_only_size
                .map(|(width, _)| width)
                .unwrap_or(ws::INPUT_ONLY_DEFAULT_W);
            (
                width,
                ws::INPUT_ONLY_H,
                ws::INPUT_ONLY_MIN_W,
                ws::INPUT_ONLY_H,
                ws::INPUT_ONLY_MAX_W,
                ws::INPUT_ONLY_H,
            )
        } else {
            let (nw, nh) = saved.size.unwrap_or((ws::VIDEO_DEFAULT_W, ws::VIDEO_DEFAULT_H));
            (
                nw,
                nh,
                ws::DANMAKU_MIN_W,
                ws::DANMAKU_MIN_H,
                ws::DANMAKU_MAX_W,
                ws::DANMAKU_MAX_H,
            )
        };
        let builder =
            WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("/video-danmaku".into()))
                .title("视频弹幕")
                .inner_size(w, h)
                .min_inner_size(min_w, min_h)
                .max_inner_size(max_w, max_h)
                .resizable(true)
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
    app.state::<crate::AppState>()
        .video_input_only
        .store(false, Ordering::Relaxed);
    Ok(())
}

/// 切换视频弹幕窗「仅输入框」紧凑模式，返回切换后的状态。
/// 与直播弹幕窗的 apply_input_only（commands/room.rs）同一套约束常量与持久化：
/// 宽度沿用完整窗口当前宽并夹紧、高度锁定一行、底边为锚、模式与几何立即落盘。
/// 差异仅在无吸附/表情面板/隐身联动（视频窗不参与这些功能）。
#[tauri::command]
pub fn set_video_input_only(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let window = app.get_webview_window(LABEL).ok_or("视频弹幕窗口不存在")?;
    let logical = |v: f64| tauri::PixelUnit::Logical(tauri::LogicalUnit::new(v));
    let constraints_for = |compact: bool| tauri::WindowSizeConstraints {
        min_width: Some(logical(if compact {
            ws::INPUT_ONLY_MIN_W
        } else {
            ws::DANMAKU_MIN_W
        })),
        min_height: Some(logical(if compact {
            ws::INPUT_ONLY_H
        } else {
            ws::DANMAKU_MIN_H
        })),
        max_width: Some(logical(if compact {
            ws::INPUT_ONLY_MAX_W
        } else {
            ws::DANMAKU_MAX_W
        })),
        max_height: Some(logical(if compact {
            ws::INPUT_ONLY_H
        } else {
            ws::DANMAKU_MAX_H
        })),
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let outer = window.outer_size().map_err(|e| e.to_string())?;
    let (size, constraints) = if enabled {
        let current_w = outer.width as f64 / scale;
        let width = current_w.clamp(ws::INPUT_ONLY_MIN_W, ws::INPUT_ONLY_MAX_W);
        (
            tauri::LogicalSize::new(width, ws::INPUT_ONLY_H),
            constraints_for(true),
        )
    } else {
        // 恢复完整模式：回到上次保存的常规几何（无保存值用视频窗默认尺寸）
        let saved = ws::load_geometry(&app, LABEL);
        let (w, h) = saved
            .size
            .unwrap_or((ws::VIDEO_DEFAULT_W, ws::VIDEO_DEFAULT_H));
        (
            tauri::LogicalSize::new(w, h),
            constraints_for(false),
        )
    };

    let app_state = app.state::<crate::AppState>();
    let previous = app_state
        .video_input_only
        .load(Ordering::Relaxed);
    // 先置标志再改几何：随后 Resized/Moved 触发的防抖落盘按该标志分流
    app_state.video_input_only.store(enabled, Ordering::Relaxed);
    // 先约束后调尺寸：避免旧 max_height 限制把目标尺寸再夹回去
    let apply = || -> tauri::Result<()> {
        window.set_size_constraints(constraints)?;
        window.set_size(size)?;
        // 底边锚定：目标顶边 = 原顶边 + 原高 - 目标高（物理像素），再钳制进显示器工作区
        let anchor_y = pos.y + outer.height as i32 - (size.height * scale).round() as i32;
        let w_px = (size.width * scale).round() as i32;
        let h_px = (size.height * scale).round() as i32;
        let (x, y) = ws::clamp_into_work_area(&window, pos.x, anchor_y, w_px, h_px);
        window.set_position(tauri::PhysicalPosition::new(x, y))?;
        Ok(())
    };
    if let Err(error) = apply() {
        // 任一步失败都恢复旧几何、约束与标志，保持前端模式和原生窗口一致
        let _ = window.set_size_constraints(constraints_for(previous));
        let _ = window.set_size(outer);
        let _ = window.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
        app_state.video_input_only.store(previous, Ordering::Relaxed);
        return Err(error.to_string());
    }
    // 模式与几何立即落盘，不等防抖
    ws::save_now(&app, LABEL);
    Ok(enabled)
}

/// 查询视频弹幕窗是否处于「仅输入框」紧凑模式（前端挂载同步用，镜像 get_danmaku_input_only）
#[tauri::command]
pub fn get_video_input_only(state: State<'_, crate::AppState>) -> bool {
    state.video_input_only.load(Ordering::Relaxed)
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
