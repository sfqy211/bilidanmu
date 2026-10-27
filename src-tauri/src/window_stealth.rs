//! 弹幕窗口隐身模式（对齐 QQ 迷你窗的「隐身」）：
//! 开启后窗口内容淡出为全透明、并对鼠标透明（点击穿透到下层）；
//! 光标停在窗口内容区超过 SHOW_DELAY_MS 后淡入并恢复交互，
//! 光标离开整个窗口超过 HIDE_DELAY_MS 后重新隐身。
//!
//! 不能用 WebView 的 mouseenter/mouseleave 判定：点击穿透期间（Windows 下
//! WS_EX_TRANSPARENT）WebView 收不到任何鼠标消息，只能靠 Rust 侧全局光标轮询
//! ——与 window_dock 的吸附判定同一套机制。
//!
//! 判定矩形：显示用窗口矩形本身，隐藏用向外扩一圈的矩形。
//! QQ 迷你窗有一圈可见的透明外框，所以它的显示判定是内缩的；本项目的弹幕窗
//! 内容是全幅铺满的，没有这圈外框，若照搬内缩会在窗口四边留出 8px 死区
//! （贴边的标题栏按钮移上去没有反应）。因此改为等效的滞后映射：
//! 光标进入窗口即显形（= 只有碰到实际内容才显示），离开窗口并越过外扩圈才隐身
//! （= 只有移出透明外圈才隐藏）。两个阈值之间形成滞回，避免贴边抖动反复显隐。

use crate::AppState;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

/// 隐藏判定的外扩量（逻辑像素）：光标要离开窗口边缘这么远才算真离开。
const HIDE_RING_PX: f64 = 8.0;
/// 光标停留在窗口内多久后显形（毫秒）：快速划过不触发。
const SHOW_DELAY_MS: u128 = 140;
/// 光标离开窗口多久后隐身（毫秒）。
const HIDE_DELAY_MS: u128 = 260;
/// 光标轮询间隔（毫秒）。
const POLL_INTERVAL_MS: u64 = 50;

/// 单个窗口的隐身运行时状态。
#[derive(Debug, Clone, Copy)]
pub struct StealthRuntime {
    /// 内容当前是否可见（false = 已隐身）
    pub visible: bool,
    /// 手动唤起（托盘/进入直播间）后的保持显示：光标进入窗口一次后解除，
    /// 否则光标一直不在窗口上会导致刚唤起就被自动隐藏。
    pub hold: bool,
}

/// 各窗口的轮询任务停止标志（label -> stop flag）
static POLL_TASKS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn poll_tasks() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    POLL_TASKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn lock_poll_tasks() -> MutexGuard<'static, HashMap<String, Arc<AtomicBool>>> {
    poll_tasks().lock().unwrap_or_else(|e| e.into_inner())
}

fn stop_polling(label: &str) {
    if let Some(flag) = lock_poll_tasks().remove(label) {
        flag.store(true, Ordering::Relaxed);
    }
}

fn lock_runtime(state: &AppState) -> MutexGuard<'_, Option<StealthRuntime>> {
    state
        .danmaku_stealth
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

/// 隐身模式是否开启（开启后窗口参与光标显隐判定）
pub fn is_active(state: &AppState) -> bool {
    lock_runtime(state).is_some()
}

/// 发给前端的隐身状态事件
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StealthPayload {
    label: String,
    /// true = 内容可见，false = 已隐身
    visible: bool,
    /// 隐身模式是否开启（false = 已关闭，visible 恒为 true）
    enabled: bool,
}

fn emit_state(app: &AppHandle, label: &str, visible: bool, enabled: bool) {
    let _ = app.emit(
        "danmaku-stealth",
        StealthPayload {
            label: label.to_string(),
            visible,
            enabled,
        },
    );
}

/// 窗口矩形与光标位置（均为物理像素），附带隐藏判定的外扩量。
/// 任一几何获取失败返回 None，轮询跳过本轮。
fn cursor_geometry(
    window: &WebviewWindow,
    app: &AppHandle,
) -> Option<(f64, f64, f64, f64, f64, f64, f64)> {
    let cursor = app.cursor_position().ok()?;
    let pos = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    let scale = window.scale_factor().ok()?;
    let ring = HIDE_RING_PX * scale;
    let left = pos.x as f64;
    let top = pos.y as f64;
    Some((
        cursor.x,
        cursor.y,
        left,
        top,
        left + size.width as f64,
        top + size.height as f64,
        ring,
    ))
}

/// 切换显隐：更新状态、设置点击穿透并广播给前端。
/// 隐身前先开穿透（淡出期间已不可点），显身后恢复交互。
fn apply_visible(app: &AppHandle, window: &WebviewWindow, visible: bool) {
    let label = window.label().to_string();
    {
        let state = app.state::<AppState>();
        let mut runtime = lock_runtime(state.inner());
        let Some(runtime) = runtime.as_mut() else { return };
        if runtime.visible == visible {
            return;
        }
        runtime.visible = visible;
    }
    let _ = window.set_ignore_cursor_events(!visible);
    emit_state(app, &label, visible, true);
}

/// 开启隐身：记录状态并启动光标轮询。开启时若光标仍在窗口内，
/// 内容保持可见，等光标离开一段时间后自然隐身。
pub fn enable(app: &AppHandle, window: &WebviewWindow) -> Result<bool, String> {
    let label = window.label().to_string();

    // 隐身态下窗口不可点击（点击穿透），无法自行拖动，与侧边吸附互斥：
    // 吸附收起态先恢复完整几何再退出，避免留下一条细条。
    crate::window_dock::exit_dock_for_full_window(app, window);

    {
        let state = app.state::<AppState>();
        let mut runtime = lock_runtime(state.inner());
        if runtime.is_some() {
            return Ok(true);
        }
        *runtime = Some(StealthRuntime {
            visible: true,
            hold: false,
        });
    }

    let _ = window.set_ignore_cursor_events(false);
    emit_state(app, &label, true, true);
    start_polling(app, &label);
    Ok(true)
}

/// 关闭隐身：恢复可见与交互，停止轮询。
pub fn disable(app: &AppHandle, window: &WebviewWindow) -> Result<bool, String> {
    let label = window.label().to_string();
    {
        let state = app.state::<AppState>();
        let mut runtime = lock_runtime(state.inner());
        if runtime.take().is_none() {
            return Ok(false);
        }
    }
    stop_polling(&label);
    let _ = window.set_ignore_cursor_events(false);
    emit_state(app, &label, true, false);
    Ok(false)
}

/// 切换隐身模式，返回切换后的开启状态。
pub fn set_enabled(app: &AppHandle, window: &WebviewWindow, enabled: bool) -> Result<bool, String> {
    if enabled {
        enable(app, window)
    } else {
        disable(app, window)
    }
}

/// 手动唤起（托盘显示/进入直播间/切换房间）：隐身态下立即显形并保持，
/// 直到光标进入窗口一次后再恢复正常的"离开即隐身"。
/// 窗口未开启隐身或本来就可见时为空操作。
pub fn force_reveal(app: &AppHandle, label: &str) {
    // 窗口本身被隐藏到托盘时不处理：此时无论显隐状态如何，屏幕上都看不到，
    // 等下次 show 时再唤起即可（否则会与"隐藏"意图打架）
    let Some(window) = app.get_webview_window(label) else {
        return;
    };
    if !window.is_visible().unwrap_or(false) {
        return;
    }

    let state = app.state::<AppState>();
    let was_hidden = {
        let mut runtime = lock_runtime(state.inner());
        match runtime.as_mut() {
            Some(runtime) => {
                let was_hidden = !runtime.visible;
                runtime.visible = true;
                // 托盘点击时光标停在托盘上，若不保持显示会立刻又被自动隐藏
                runtime.hold = true;
                was_hidden
            }
            None => return,
        }
    };
    let _ = window.set_ignore_cursor_events(false);
    if was_hidden {
        emit_state(app, label, true, true);
    }
}

/// 窗口销毁时清理隐身残留（状态 + 轮询任务），
/// 避免同 label 重建后被上一世的状态劫持。
pub fn cleanup(label: &str, app: &AppHandle) {
    // 隐身状态只属于常驻弹幕窗口：主页面等其它窗口销毁时不能清掉它
    if label != crate::commands::room::DANMAKU_WINDOW_LABEL {
        return;
    }
    let state = app.state::<AppState>();
    let existed = lock_runtime(state.inner()).take().is_some();
    stop_polling(label);
    if existed {
        // 窗口即将销毁，穿透标记无需恢复；仅保证前端状态归位
        emit_state(app, label, true, false);
    }
}

/// 启动该窗口的光标轮询：驱动"悬停显形 / 离开隐身"。
fn start_polling(app: &AppHandle, label: &str) {
    stop_polling(label);

    let stop = Arc::new(AtomicBool::new(false));
    lock_poll_tasks().insert(label.to_string(), stop.clone());

    let app_handle = app.clone();
    let label = label.to_string();
    tauri::async_runtime::spawn(async move {
        // 光标在显示判定矩形内的累计起点 / 在窗口外的累计起点
        let mut inside_since: Option<std::time::Instant> = None;
        let mut outside_since: Option<std::time::Instant> = None;

        loop {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(POLL_INTERVAL_MS)).await;
            if stop.load(Ordering::Relaxed) {
                break;
            }

            let Some(window) = app_handle.get_webview_window(&label) else {
                break;
            };
            // 隐藏到托盘时不判定；重新 show 后由 force_reveal 恢复显示
            if !window.is_visible().unwrap_or(false) {
                inside_since = None;
                outside_since = None;
                continue;
            }

            let state = app_handle.state::<AppState>();
            let runtime = *lock_runtime(state.inner());
            let Some(runtime) = runtime else { break };

            let Some((cx, cy, left, top, right, bottom, ring)) =
                cursor_geometry(&window, &app_handle)
            else {
                continue;
            };

            let inside_window = cx >= left && cx < right && cy >= top && cy < bottom;
            // 滞回外圈：离开窗口但还没越过这一圈时，仍按"在窗口内"处理
            let inside_tolerance = cx >= left - ring
                && cx < right + ring
                && cy >= top - ring
                && cy < bottom + ring;

            if runtime.visible {
                if runtime.hold {
                    // 手动唤起的保持态：光标进入窗口后解除，之后按正常规则隐身
                    if inside_window {
                        let mut current = lock_runtime(state.inner());
                        if let Some(current) = current.as_mut() {
                            current.hold = false;
                        }
                    }
                    outside_since = None;
                    continue;
                }
                if inside_tolerance {
                    outside_since = None;
                } else {
                    let start = *outside_since.get_or_insert_with(std::time::Instant::now);
                    if start.elapsed().as_millis() >= HIDE_DELAY_MS {
                        outside_since = None;
                        apply_visible(&app_handle, &window, false);
                    }
                }
            } else if inside_window {
                let start = *inside_since.get_or_insert_with(std::time::Instant::now);
                if start.elapsed().as_millis() >= SHOW_DELAY_MS {
                    inside_since = None;
                    apply_visible(&app_handle, &window, true);
                }
            } else {
                inside_since = None;
            }
        }
    });
}

// ── Tauri 命令 ──

/// 开启/关闭弹幕窗口隐身模式，返回切换后的开启状态。
#[tauri::command]
pub fn set_danmaku_stealth(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let window = app
        .get_webview_window(crate::commands::room::DANMAKU_WINDOW_LABEL)
        .ok_or_else(|| "弹幕窗口不存在".to_string())?;
    set_enabled(&app, &window, enabled)
}

/// 隐身状态快照：前端挂载时同步用。只同步 enabled 不够——若此刻正处于
/// 隐态（点击穿透中），前端按"可见"渲染会出现内容可见但点不到的错位。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StealthSnapshot {
    pub enabled: bool,
    pub visible: bool,
}

/// 查询弹幕窗口隐身状态（窗口重建/前端重挂载时同步初始状态）。
#[tauri::command]
pub fn get_danmaku_stealth(state: tauri::State<'_, AppState>) -> StealthSnapshot {
    match *lock_runtime(state.inner()) {
        Some(runtime) => StealthSnapshot {
            enabled: true,
            visible: runtime.visible,
        },
        None => StealthSnapshot {
            enabled: false,
            visible: true,
        },
    }
}
