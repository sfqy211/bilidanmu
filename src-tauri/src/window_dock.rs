//! 侧边吸附（贴边收缩）：把窗口拖到屏幕左/右边缘后收缩为细条，
//! 鼠标悬停展开、离开后延迟收回、展开后拖离边缘退出吸附（QQ 模式）。
//! 仅对主页面窗口（main）与弹幕窗口（danmaku-*）生效，抽屉窗口不参与。

use crate::AppState;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow,
    WindowSizeConstraints,
};

/// 吸附边（仅左右，不含顶/底）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DockSide {
    Left,
    Right,
}

/// 吸附阶段
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DockPhase {
    Collapsed,
    Expanded,
}

/// 单个窗口的吸附状态
#[derive(Debug, Clone)]
pub struct DockState {
    pub side: DockSide,
    pub phase: DockPhase,
    /// 吸附前的外框位置与尺寸（退出吸附时恢复）
    pub normal_pos: PhysicalPosition<i32>,
    pub normal_size: PhysicalSize<u32>,
}

/// 发给前端的吸附状态变化事件
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DockChangedPayload {
    label: String,
    /// "normal" | "collapsed" | "expanded"
    phase: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    side: Option<DockSide>,
}

/// 收缩条基准宽度（逻辑像素，100% 缩放下的宽度）
const DOCK_WIDTH: u32 = 6;

/// 收缩条实际宽度（物理像素）：按显示器缩放换算，保证高 DPI 下逻辑宽度稳定、可点中。
/// scale_factor 异常时回退为 1.0。
fn dock_width_px(monitor: &tauri::Monitor) -> u32 {
    (DOCK_WIDTH as f64 * monitor.scale_factor()).round().max(1.0) as u32
}
/// 进入吸附的边缘距离阈值（物理像素）
const ENTER_THRESHOLD: i32 = 12;
/// 退出吸附的边缘距离阈值（滞回，大于进入阈值）
const EXIT_THRESHOLD: i32 = 28;

/// 弹幕窗口的正常尺寸约束（与 open_danmaku_window 的 min/max_inner_size 一致）
const DANMAKU_MIN_W: f64 = 240.0;
const DANMAKU_MIN_H: f64 = 160.0;
const DANMAKU_MAX_W: f64 = 1200.0;
const DANMAKU_MAX_H: f64 = 900.0;
/// 主页面窗口的正常尺寸约束（与 tauri.conf.json 的 minWidth/minHeight 一致；无最大上限）
const MAIN_MIN_W: f64 = 800.0;
const MAIN_MIN_H: f64 = 600.0;

/// 光标轮询间隔（毫秒）
const POLL_INTERVAL_MS: u64 = 50;
/// 光标持续在窗口外多久后收回（毫秒）
const COLLAPSE_AFTER_MS: u128 = 250;

/// 各窗口光标轮询任务的停止标志（label -> stop flag）
static POLL_TASKS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn poll_tasks() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    POLL_TASKS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 停止某窗口的轮询任务（若存在）
fn stop_polling(label: &str) {
    if let Some(flag) = poll_tasks().lock().unwrap().remove(label) {
        flag.store(true, Ordering::Relaxed);
    }
}

fn lock_docks(state: &AppState) -> MutexGuard<'_, std::collections::HashMap<String, DockState>> {
    state.window_docks.lock().unwrap_or_else(|e| e.into_inner())
}

fn lock_cooldowns(state: &AppState) -> MutexGuard<'_, std::collections::HashSet<String>> {
    state.dock_cooldowns.lock().unwrap_or_else(|e| e.into_inner())
}

/// 收缩态：无最小/最大尺寸约束（允许缩成细条）
fn loose_constraints() -> WindowSizeConstraints {
    WindowSizeConstraints {
        min_width: None,
        min_height: None,
        max_width: None,
        max_height: None,
    }
}

/// 常态：恢复窗口正常的尺寸约束（按窗口类型区分）
/// - 弹幕窗口：min 240x160 / max 1200x900（对齐 open_danmaku_window 的约束）
/// - 主页面窗口：min 800x600、无最大上限（对齐 tauri.conf.json，未被吸附前即可任意拉大）
/// 约束单位用逻辑像素（Logical），tao 内部会按缩放换算，与创建窗口时的 inner_size 语义一致。
fn normal_constraints(label: &str) -> WindowSizeConstraints {
    let logical = |v: f64| tauri::PixelUnit::Logical(tauri::LogicalUnit::new(v));
    if label == "main" {
        WindowSizeConstraints {
            min_width: Some(logical(MAIN_MIN_W)),
            min_height: Some(logical(MAIN_MIN_H)),
            max_width: None,
            max_height: None,
        }
    } else {
        WindowSizeConstraints {
            min_width: Some(logical(DANMAKU_MIN_W)),
            min_height: Some(logical(DANMAKU_MIN_H)),
            max_width: Some(logical(DANMAKU_MAX_W)),
            max_height: Some(logical(DANMAKU_MAX_H)),
        }
    }
}

fn emit_dock_changed(app: &AppHandle, label: &str, phase: &str, side: Option<DockSide>) {
    let _ = app.emit(
        "dock-changed",
        DockChangedPayload {
            label: label.to_string(),
            phase: phase.to_string(),
            side,
        },
    );
}

/// 该 label 是否参与吸附（main / danmaku-*）
fn is_dockable(label: &str) -> bool {
    label == "main" || label.starts_with("danmaku-")
}

/// 窗口销毁时清理该 label 的吸附残留：DockState、拖动冷却、轮询任务。
/// 弹幕窗口 label 是确定性的 danmaku-{room_id}，若不清理，同 label 重建窗口时
/// 轮询会读到上一世残留的陈旧相位，把新窗口误当吸附态驱动（搬到旧边缘/压成细条）。
pub fn cleanup(label: &str, app: &AppHandle) {
    if !is_dockable(label) {
        return;
    }
    let state = app.state::<AppState>();
    lock_docks(state.inner()).remove(label);
    lock_cooldowns(state.inner()).remove(label);
    stop_polling(label);
}

/// 进入吸附：记录正常几何，收缩为贴边细条
fn enter_dock(app: &AppHandle, window: &WebviewWindow, side: DockSide) {
    let state = app.state::<AppState>();
    let label = window.label().to_string();

    let Ok(pos) = window.outer_position() else { return };
    let Ok(size) = window.outer_size() else { return };
    let Some(monitor) = window.current_monitor().ok().flatten() else { return };
    let work = monitor.position();
    let work_size = monitor.size();

    // 记录吸附前几何
    {
        let mut docks = lock_docks(state.inner());
        docks.insert(
            label.clone(),
            DockState {
                side,
                phase: DockPhase::Collapsed,
                normal_pos: pos,
                normal_size: size,
            },
        );
    }

    // 放宽尺寸约束才能缩成细条
    let _ = window.set_size_constraints(loose_constraints());

    // 细条贴死边缘：高度取窗口当前高度（夹在工作区内），宽度按 DPI 换算
    let dock_w = dock_width_px(&monitor);
    let collapsed_h = size.height.min(work_size.height);
    let collapsed_y = pos.y.clamp(work.y, work.y + work_size.height as i32 - collapsed_h as i32);
    let collapsed_x = match side {
        DockSide::Left => work.x,
        DockSide::Right => work.x + work_size.width as i32 - dock_w as i32,
    };
    let _ = window.set_position(PhysicalPosition::new(collapsed_x, collapsed_y));
    let _ = window.set_size(PhysicalSize::new(dock_w, collapsed_h));

    emit_dock_changed(app, &label, "collapsed", Some(side));
}

/// 展开：从细条恢复为正常尺寸（仍贴边，保持吸附态）
fn expand_dock(app: &AppHandle, window: &WebviewWindow) {
    let state = app.state::<AppState>();
    let label = window.label().to_string();

    let (side, normal_size) = {
        let mut docks = lock_docks(state.inner());
        match docks.get_mut(&label) {
            Some(d) if d.phase == DockPhase::Collapsed => {
                d.phase = DockPhase::Expanded;
                (d.side, d.normal_size)
            }
            _ => return,
        }
    };

    let Some(monitor) = window.current_monitor().ok().flatten() else { return };
    let work = monitor.position();
    let work_size = monitor.size();

    let Ok(pos) = window.outer_position() else { return };
    // 先夹高度到工作区：窗口可能比当前工作区还高（如运行时拔掉副屏/分辨率下调后），
    // 否则 clamp 的上界 work.y + work_size.height - normal_size.height 会小于下界 work.y，
    // i32::clamp 在 min > max 时直接 panic（对齐 enter_dock/collapse_dock 的 .min 处理）。
    let expanded_h = normal_size.height.min(work_size.height);
    let expanded_y = pos
        .y
        .clamp(work.y, work.y + work_size.height as i32 - expanded_h as i32);
    let expanded_x = match side {
        DockSide::Left => work.x,
        DockSide::Right => work.x + work_size.width as i32 - normal_size.width as i32,
    };
    // 必须先 set_size 再 set_position：展开前窗口是 6px 窄条，若先设位置，
    // 右缘展开的瞬间 win_right 会小于 EXIT 阈值，Moved 处理器会误判"拖离边缘"而 exit_dock。
    // 先恢复尺寸后，任意中间几何状态下 left_edge 都为 false，不会误退出。
    let _ = window.set_size(PhysicalSize::new(normal_size.width, expanded_h));
    let _ = window.set_position(PhysicalPosition::new(expanded_x, expanded_y));

    emit_dock_changed(app, &label, "expanded", Some(side));
}

/// 收回：从展开恢复为细条
fn collapse_dock(app: &AppHandle, window: &WebviewWindow) {
    let state = app.state::<AppState>();
    let label = window.label().to_string();

    let side = {
        let mut docks = lock_docks(state.inner());
        match docks.get_mut(&label) {
            Some(d) if d.phase == DockPhase::Expanded => {
                d.phase = DockPhase::Collapsed;
                d.side
            }
            _ => return,
        }
    };

    let Some(monitor) = window.current_monitor().ok().flatten() else { return };
    let work = monitor.position();
    let work_size = monitor.size();

    let Ok(pos) = window.outer_position() else { return };
    let Ok(size) = window.outer_size() else { return };
    let dock_w = dock_width_px(&monitor);
    let collapsed_h = size.height.min(work_size.height);
    let collapsed_y = pos.y.clamp(work.y, work.y + work_size.height as i32 - collapsed_h as i32);
    let collapsed_x = match side {
        DockSide::Left => work.x,
        DockSide::Right => work.x + work_size.width as i32 - dock_w as i32,
    };
    // 先 set_size 再 set_position：与 expand_dock 同理，避免右缘收回的中间几何被
    // Moved 处理器误判为"拖离边缘"。收回仅在 Expanded 态触发，此处为防御。
    let _ = window.set_size(PhysicalSize::new(dock_w, collapsed_h));
    let _ = window.set_position(PhysicalPosition::new(collapsed_x, collapsed_y));

    emit_dock_changed(app, &label, "collapsed", Some(side));
}

/// 退出吸附：恢复正常尺寸约束并清除状态，进入拖动冷却（防止拖动中被立刻重新吸附）
fn exit_dock(app: &AppHandle, window: &WebviewWindow) {
    let state = app.state::<AppState>();
    let label = window.label().to_string();

    let existed = {
        let mut docks = lock_docks(state.inner());
        docks.remove(&label).is_some()
    };
    if !existed {
        return;
    }

    // 进入拖动冷却：冷却期间即使贴边也不重新吸附，拖离边缘后才解除
    lock_cooldowns(state.inner()).insert(label.clone());

    // 恢复正常尺寸约束
    let _ = window.set_size_constraints(normal_constraints(&label));

    emit_dock_changed(app, &label, "normal", None);
}

/// 光标是否已离开窗口区域（松手/移开的判定，替代不可靠的前端 mouseleave）
fn cursor_outside(window: &WebviewWindow, app: &AppHandle) -> bool {
    let Ok(cursor) = app.cursor_position() else { return false };
    let Ok(pos) = window.outer_position() else { return false };
    let Ok(size) = window.outer_size() else { return false };

    let left = pos.x as f64;
    let top = pos.y as f64;
    let right = left + size.width as f64;
    let bottom = top + size.height as f64;

    cursor.x < left || cursor.x >= right || cursor.y < top || cursor.y >= bottom
}

/// 光标是否落在窗口区域内（用于收缩条悬停展开的后端判定）。
/// 所有取几何/光标失败的路径一律返回 false，避免误判"在窗口内"而误触发展开。
fn cursor_over_window(window: &WebviewWindow, app: &AppHandle) -> bool {
    let Ok(cursor) = app.cursor_position() else { return false };
    let Ok(pos) = window.outer_position() else { return false };
    let Ok(size) = window.outer_size() else { return false };

    let left = pos.x as f64;
    let top = pos.y as f64;
    let right = left + size.width as f64;
    let bottom = top + size.height as f64;

    cursor.x >= left && cursor.x < right && cursor.y >= top && cursor.y < bottom
}

/// 判定是否贴到屏幕左/右边缘（不含顶/底）。返回 Some(side) 表示应进入吸附。
/// 贴边语义对齐 QQ：窗口边缘"碰到或越过"屏幕边缘即算贴边，
/// 允许窗口被拖出屏幕外一段距离（此时窗口边缘已在屏幕外侧，仍视为贴边）。
fn detect_edge(window: &WebviewWindow) -> Option<DockSide> {
    let pos = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    let monitor = window.current_monitor().ok().flatten()?;
    let work = monitor.position();
    let work_size = monitor.size();
    let work_right = work.x + work_size.width as i32;
    let win_right = pos.x + size.width as i32;

    // 贴左：窗口左缘不超过屏幕左缘 + 阈值（含已拖出屏幕左侧的情况）
    let near_left = pos.x <= work.x + ENTER_THRESHOLD;
    // 贴右：窗口右缘不小于屏幕右缘 - 阈值（含已拖出屏幕右侧的情况）
    let near_right = win_right >= work_right - ENTER_THRESHOLD;

    if near_left {
        Some(DockSide::Left)
    } else if near_right {
        Some(DockSide::Right)
    } else {
        None
    }
}

/// 窗口是否已离开所在边缘（退出吸附判定，滞回阈值）
fn left_edge(window: &WebviewWindow, side: DockSide) -> bool {
    let Ok(pos) = window.outer_position() else { return false };
    let Ok(size) = window.outer_size() else { return false };
    let Some(monitor) = window.current_monitor().ok().flatten() else { return false };
    let work = monitor.position();
    let work_size = monitor.size();
    let work_right = work.x + work_size.width as i32;
    let win_right = pos.x + size.width as i32;

    match side {
        // 离开左边 = 窗口左缘明显进入屏幕内（不再贴左）
        DockSide::Left => pos.x > work.x + EXIT_THRESHOLD,
        // 离开右边 = 窗口右缘明显进入屏幕内（不再贴右）
        DockSide::Right => win_right < work_right - EXIT_THRESHOLD,
    }
}

/// 窗口是否已同时远离左右两条边缘（解除拖动冷却的判定）
fn far_from_edges(window: &WebviewWindow) -> bool {
    let Ok(pos) = window.outer_position() else { return false };
    let Ok(size) = window.outer_size() else { return false };
    let Some(monitor) = window.current_monitor().ok().flatten() else { return false };
    let work = monitor.position();
    let work_size = monitor.size();
    let work_right = work.x + work_size.width as i32;
    let win_right = pos.x + size.width as i32;

    let near_left = pos.x <= work.x + EXIT_THRESHOLD;
    let near_right = win_right >= work_right - EXIT_THRESHOLD;
    !near_left && !near_right
}

/// 给可吸附窗口挂接吸附逻辑：
/// - Moved 仅处理"展开态拖离边缘退出吸附"（QQ 模式）；
/// - 进入吸附（松手贴边）与展开收回（光标离开）由光标轮询驱动，
///   因为 Moved 在拖动中持续触发且松手后停止，无法区分"是否松手/光标是否离开"。
pub fn attach(window: &WebviewWindow, app: &AppHandle) {
    if !is_dockable(window.label()) {
        return;
    }
    let app_handle = app.clone();
    let label = window.label().to_string();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Moved(_) = event {
            let Some(win) = app_handle.get_webview_window(&label) else { return };
            let state = app_handle.state::<AppState>();

            let current = {
                let docks = lock_docks(state.inner());
                docks.get(&label).map(|d| (d.phase, d.side))
            };

            // 仅"展开态拖离边缘 → 退出吸附"；冷却解除交给轮询里的 far_from_edges
            if let Some((DockPhase::Expanded, side)) = current {
                if left_edge(&win, side) {
                    exit_dock(&app_handle, &win);
                }
            }
        }
    });

    start_polling(window, app);
}

/// 启动该窗口的光标轮询：驱动"松手贴边进入吸附"与"光标离开展开窗口收回"。
fn start_polling(window: &WebviewWindow, app: &AppHandle) {
    let label = window.label().to_string();
    stop_polling(&label); // 防御：先停掉同名旧任务

    let stop = Arc::new(AtomicBool::new(false));
    poll_tasks().lock().unwrap().insert(label.clone(), stop.clone());

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        // 光标持续在窗口外的累计时间（用于收回延迟）
        let mut outside_since: Option<std::time::Instant> = None;

        loop {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(POLL_INTERVAL_MS)).await;

            let Some(win) = app_handle.get_webview_window(&label) else {
                break;
            };
            if !win.is_visible().unwrap_or(false) {
                continue;
            }
            let state = app_handle.state::<AppState>();

            let current = {
                let docks = lock_docks(state.inner());
                docks.get(&label).map(|d| (d.phase, d.side))
            };

            match current {
                // 正常态：贴边 + 光标离开窗口（= 已松手）→ 进入吸附
                None => {
                    let in_cooldown = lock_cooldowns(state.inner()).contains(&label);
                    if in_cooldown {
                        // 冷却中：拖离左右边缘后解除冷却
                        if far_from_edges(&win) {
                            lock_cooldowns(state.inner()).remove(&label);
                        }
                    } else if detect_edge(&win).is_some() && cursor_outside(&win, &app_handle) {
                        if let Some(side) = detect_edge(&win) {
                            enter_dock(&app_handle, &win, side);
                        }
                    }
                    outside_since = None;
                }
                // 展开态：光标离开窗口并持续 COLLAPSE_AFTER_MS → 收回
                Some((DockPhase::Expanded, _)) => {
                    if cursor_outside(&win, &app_handle) {
                        let start = outside_since.get_or_insert_with(std::time::Instant::now);
                        if start.elapsed().as_millis() >= COLLAPSE_AFTER_MS {
                            outside_since = None;
                            collapse_dock(&app_handle, &win);
                        }
                    } else {
                        outside_since = None;
                    }
                }
                // 收缩态：光标进入收缩条矩形 → 展开。
                // 与前端 DockCollapsedBar 的 mouseenter 双通道：轮询保证透明/置顶/click-through
                // 窄条上也能可靠唤起（修复"贴边不灵敏"），mouseenter 作为零延迟快速路径；
                // expand_dock 内部有 Collapsed 守卫，双触发安全。
                Some((DockPhase::Collapsed, _)) => {
                    if cursor_over_window(&win, &app_handle) {
                        expand_dock(&app_handle, &win);
                    }
                    outside_since = None;
                }
            }
        }
    });
}

/// show 窗口后恢复吸附几何（tao show 可能复位位置/尺寸），保持吸附态。
/// 若窗口处于吸附态返回 true，调用方据此跳过常规几何恢复。
pub fn restore_if_docked(window: &WebviewWindow, app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    let label = window.label().to_string();
    let phase = {
        let docks = lock_docks(state.inner());
        docks.get(&label).map(|d| d.phase)
    };
    match phase {
        Some(DockPhase::Collapsed) => {
            // 重新收缩（show 后位置可能已被复位）
            let side = {
                let docks = lock_docks(state.inner());
                docks.get(&label).map(|d| d.side)
            };
            if let Some(side) = side {
                let _ = window.set_size_constraints(loose_constraints());
                if let Some(monitor) = window.current_monitor().ok().flatten() {
                    let work = monitor.position();
                    let work_size = monitor.size();
                    let Ok(size) = window.outer_size() else { return true };
                    let Ok(pos) = window.outer_position() else { return true };
                    let dock_w = dock_width_px(&monitor);
                    let collapsed_h = size.height.min(work_size.height);
                    let collapsed_y =
                        pos.y.clamp(work.y, work.y + work_size.height as i32 - collapsed_h as i32);
                    let collapsed_x = match side {
                        DockSide::Left => work.x,
                        DockSide::Right => work.x + work_size.width as i32 - dock_w as i32,
                    };
                    let _ = window.set_position(PhysicalPosition::new(collapsed_x, collapsed_y));
                    let _ = window.set_size(PhysicalSize::new(dock_w, collapsed_h));
                }
            }
            true
        }
        Some(DockPhase::Expanded) => true, // 展开态 show 后维持现状即可
        None => false,
    }
}

// ── Tauri 命令 ──

#[tauri::command]
pub fn dock_expand(label: String, app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("窗口不存在: {label}"))?;
    expand_dock(&app, &window);
    Ok(())
}

#[tauri::command]
pub fn dock_collapse(label: String, app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("窗口不存在: {label}"))?;
    collapse_dock(&app, &window);
    Ok(())
}

#[tauri::command]
pub fn dock_exit(label: String, app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("窗口不存在: {label}"))?;
    exit_dock(&app, &window);
    Ok(())
}

/// 查询窗口吸附状态：none / collapsed / expanded
#[tauri::command]
pub fn get_dock_state(label: String, app: AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();
    let docks = lock_docks(state.inner());
    let phase = match docks.get(&label).map(|d| d.phase) {
        Some(DockPhase::Collapsed) => "collapsed",
        Some(DockPhase::Expanded) => "expanded",
        None => "normal",
    };
    Ok(phase.to_string())
}
