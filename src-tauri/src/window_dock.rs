//! 侧边吸附（贴边收缩）：把窗口拖到屏幕左/右/上边缘后收缩为细条，
//! 鼠标悬停展开、离开后延迟收回、展开后拖离边缘退出吸附（QQ 模式）。
//! 底边不参与（与任务栏抢区域）。仅对弹幕窗口（danmaku-*）生效，抽屉窗口不参与。

use crate::AppState;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow,
    WindowSizeConstraints,
};

/// 吸附边（左右与顶部，不含底）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DockSide {
    Left,
    Right,
    Top,
}

/// 吸附阶段
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DockPhase {
    Collapsed,
    Expanded,
    /// 收回动画播放中：光标已离开，窗体仍保持展开全尺寸，等前端动画结束回调 dock_collapse。
    /// 不参与几何驱动，仅作为"已发起收回、待真正缩窗"的中间态。
    Collapsing,
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

/// 收缩条基准宽度（逻辑像素，100% 缩放下的宽度）。要足够宽以容纳指示条并有充裕的悬停判定区。
const DOCK_WIDTH: u32 = 20;
/// 收缩条固定长度（物理像素）：左右条的高度 / 顶条的宽度，居中于原窗口位置
const COLLAPSED_LENGTH: u32 = 160;

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

/// 常态：恢复弹幕窗口正常的尺寸约束（对齐 open_danmaku_window 的 min/max_inner_size）。
/// 约束单位用逻辑像素（Logical），tao 内部会按缩放换算，与创建窗口时的 inner_size 语义一致。
fn normal_constraints() -> WindowSizeConstraints {
    let logical = |v: f64| tauri::PixelUnit::Logical(tauri::LogicalUnit::new(v));
    WindowSizeConstraints {
        min_width: Some(logical(DANMAKU_MIN_W)),
        min_height: Some(logical(DANMAKU_MIN_H)),
        max_width: Some(logical(DANMAKU_MAX_W)),
        max_height: Some(logical(DANMAKU_MAX_H)),
    }
}

/// 收缩态的几何：固定细条，贴死所在边缘、居中于原窗口位置
/// （左右条：固定高度、垂直居中；顶条：固定宽度、水平居中）。
/// normal_pos/normal_size 为吸附前记录的原窗口外框位置与尺寸。
/// 返回 (position, size)，供 enter_dock / collapse_dock / restore_if_docked 统一使用。
fn collapsed_geometry(
    monitor: &tauri::Monitor,
    side: DockSide,
    normal_pos: PhysicalPosition<i32>,
    normal_size: PhysicalSize<u32>,
) -> (PhysicalPosition<i32>, PhysicalSize<u32>) {
    let work = monitor.position();
    let work_size = monitor.size();
    let dock_w = dock_width_px(monitor);

    if side == DockSide::Top {
        // 顶条：固定宽度、水平居中于原窗口中心，贴死工作区顶缘
        let w = (COLLAPSED_LENGTH as usize).min(work_size.width as usize) as u32;
        let eff_w = normal_size.width.min(work_size.width);
        let eff_x = normal_pos
            .x
            .clamp(work.x, work.x + work_size.width as i32 - eff_w as i32);
        let center_x = eff_x + eff_w as i32 / 2;
        let x = (center_x - w as i32 / 2).clamp(work.x, work.x + work_size.width as i32 - w as i32);
        return (PhysicalPosition::new(x, work.y), PhysicalSize::new(w, dock_w));
    }

    let h = (COLLAPSED_LENGTH as usize).min(work_size.height as usize) as u32;
    // 垂直居中于原窗口中心，再夹回工作区内。
    // 必须用与 expand_dock 一致的 clamp 后几何算中心：expand_dock 会把高度钳到工作区、
    // 把 y 钳到工作区内，若这里直接用未 clamp 的 normal_pos/normal_size，当窗口顶部拖出屏
    // 或比工作区高时，收缩条会与它展开出的窗口垂直中心错开（固定偏移），居中不变量失效。
    let eff_h = normal_size.height.min(work_size.height);
    let eff_y = normal_pos
        .y
        .clamp(work.y, work.y + work_size.height as i32 - eff_h as i32);
    let center_y = eff_y + eff_h as i32 / 2;
    let y = (center_y - h as i32 / 2).clamp(work.y, work.y + work_size.height as i32 - h as i32);
    let x = match side {
        DockSide::Left => work.x,
        DockSide::Right => work.x + work_size.width as i32 - dock_w as i32,
        DockSide::Top => unreachable!("Top 已在上方分支返回"),
    };
    (PhysicalPosition::new(x, y), PhysicalSize::new(dock_w, h))
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

/// 该 label 是否参与吸附（仅弹幕窗口 danmaku-*）。
/// 主页面窗口不参与：它是常规管理窗口、非置顶，吸附条会被其它窗口盖住，
/// 且任务栏 hide/show 还原路径与吸附态冲突（曾导致还原后窗口错乱的恶性 bug）。
/// 弹幕窗口 transparent + always_on_top，走托盘 hide/show（restore_if_docked 覆盖），吸附稳定。
fn is_dockable(label: &str) -> bool {
    label.starts_with("danmaku-")
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

    // 收缩为固定高度细条：贴死边缘、垂直居中于原窗口位置
    let (cpos, csize) = collapsed_geometry(&monitor, side, pos, size);
    let _ = window.set_position(cpos);
    let _ = window.set_size(csize);

    emit_dock_changed(app, &label, "collapsed", Some(side));
}

/// 展开：更新状态并通知前端，但**不立即改变窗口几何**。
/// 前端收到 "expanded" 事件后先准备 DOM（卸载收缩条、挂载隐藏态的主内容），
/// 再回调 dock_apply_expand 命令执行真正的 set_size/set_position，
/// 避免窗口已扩大但收缩条仍在渲染导致的闪现。
/// 后端同时 spawn 一个 300ms 兜底任务，防止前端无响应时窗口永久停留在收缩态。
fn expand_dock(app: &AppHandle, window: &WebviewWindow) {
    let state = app.state::<AppState>();
    let label = window.label().to_string();

    let (side, normal_pos, normal_size) = {
        let mut docks = lock_docks(state.inner());
        match docks.get_mut(&label) {
            Some(d) if d.phase == DockPhase::Collapsed => {
                d.phase = DockPhase::Expanded;
                (d.side, d.normal_pos, d.normal_size)
            }
            _ => return,
        }
    };

    emit_dock_changed(app, &label, "expanded", Some(side));

    // 兜底：300ms 后若仍处于 Expanded 态（前端可能未回调），直接应用几何
    let app_clone = app.clone();
    let label_clone = label.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        let Some(win) = app_clone.get_webview_window(&label_clone) else { return };
        apply_expand_geometry(&app_clone, &win, side, normal_pos, normal_size);
    });
}

/// 应用展开几何：恢复窗口到正常尺寸并定位到吸附边缘。
/// 由前端 dock_apply_expand 命令调用（DOM 已准备好之后），也可被兜底任务调用。
fn apply_expand_geometry(
    app: &AppHandle,
    window: &WebviewWindow,
    side: DockSide,
    normal_pos: PhysicalPosition<i32>,
    normal_size: PhysicalSize<u32>,
) {
    let state = app.state::<AppState>();
    let label = window.label().to_string();

    // 竞态守卫：仅在 Expanded 态应用几何（可能已被 collapse/exit 取消）
    {
        let docks = lock_docks(state.inner());
        match docks.get(&label) {
            Some(d) if d.phase == DockPhase::Expanded => {}
            _ => return,
        }
    }

    let Some(monitor) = window.current_monitor().ok().flatten() else { return };
    let work = monitor.position();
    let work_size = monitor.size();

    if side == DockSide::Top {
        // 顶吸展开：贴死工作区顶缘，宽度钳到工作区、水平位置夹回工作区内
        let expanded_w = normal_size.width.min(work_size.width);
        let expanded_x = normal_pos
            .x
            .clamp(work.x, work.x + work_size.width as i32 - expanded_w as i32);
        let _ = window.set_size(PhysicalSize::new(expanded_w, normal_size.height));
        let _ = window.set_position(PhysicalPosition::new(expanded_x, work.y));
        return;
    }

    let expanded_h = normal_size.height.min(work_size.height);
    let expanded_y = normal_pos
        .y
        .clamp(work.y, work.y + work_size.height as i32 - expanded_h as i32);
    let expanded_x = match side {
        DockSide::Left => work.x,
        DockSide::Right => work.x + work_size.width as i32 - normal_size.width as i32,
        DockSide::Top => unreachable!("Top 已在上方分支返回"),
    };
    let _ = window.set_size(PhysicalSize::new(normal_size.width, expanded_h));
    let _ = window.set_position(PhysicalPosition::new(expanded_x, expanded_y));
}

/// 收回：从展开/收回动画状态恢复为细条。
/// 由前端滑出动画结束后的 dock_collapse 回调触发（也接受直接的 dock_collapse 命令）。
fn collapse_dock(app: &AppHandle, window: &WebviewWindow) {
    let state = app.state::<AppState>();
    let label = window.label().to_string();

    let (side, normal_pos, normal_size) = {
        let mut docks = lock_docks(state.inner());
        match docks.get_mut(&label) {
            Some(d) if d.phase == DockPhase::Expanded || d.phase == DockPhase::Collapsing => {
                d.phase = DockPhase::Collapsed;
                (d.side, d.normal_pos, d.normal_size)
            }
            _ => return,
        }
    };

    // 竞态加固：塌缩前复核光标是否仍在窗口外。
    // 前端 dock.collapse 回调可能与"光标重新进入→取消回 Expanded"竞争，若用户刚把光标移回
    // 窗口想保持展开，一条在途的 collapse 不应把窗口塌缩掉。此时放弃本次塌缩并恢复为展开态。
    if !cursor_outside(window, app) {
        let restored = {
            let mut docks = lock_docks(state.inner());
            match docks.get_mut(&label) {
                Some(d) if d.phase == DockPhase::Collapsed => {
                    d.phase = DockPhase::Expanded;
                    true
                }
                _ => false,
            }
        };
        // 必须通知前端：否则前端仍停在 collapsing + slideOut=true，内容保持滑出屏外不可见。
        // 这是与轮询 Collapsing→Expanded 分支（同样 emit "expanded"）对应的相位变更。
        if restored {
            emit_dock_changed(app, &label, "expanded", Some(side));
        }
        return;
    }

    let Some(monitor) = window.current_monitor().ok().flatten() else { return };

    // 收缩为固定高度细条：贴死边缘、垂直居中于原窗口位置。
    // 用吸附前记录的 normal_size 算垂直中心（与 enter_dock/restore_if_docked 口径一致），
    // 否则展开被钳高（窗口比工作区高）时，进入与收回的收缩条位置会不一致而上下跳。
    let (cpos, csize) = collapsed_geometry(&monitor, side, normal_pos, normal_size);
    // 先 set_size 再 set_position：与 expand_dock 同理，避免右缘收回的中间几何被
    // Moved 处理器误判为"拖离边缘"。收回仅在 Expanded 态触发，此处为防御。
    let _ = window.set_size(csize);
    let _ = window.set_position(cpos);

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
    let _ = window.set_size_constraints(normal_constraints());

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

/// 判定是否贴到屏幕左/右/上边缘（不含底）。返回 Some(side) 表示应进入吸附。
/// 贴边语义对齐 QQ：窗口边缘"碰到或越过"屏幕边缘即算贴边，
/// 允许窗口被拖出屏幕外一段距离（此时窗口边缘已在屏幕外侧，仍视为贴边）。
/// 角落归属左右优先：同时贴近左/右与上时归左右，顶吸仅在未贴左右时生效。
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
    // 贴上：窗口顶缘不超过屏幕工作区顶缘 + 阈值（含已拖出屏幕上方的情况）
    let near_top = pos.y <= work.y + ENTER_THRESHOLD;

    if near_left {
        Some(DockSide::Left)
    } else if near_right {
        Some(DockSide::Right)
    } else if near_top {
        Some(DockSide::Top)
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
        // 离开上边 = 窗口顶缘明显进入屏幕内（不再贴上）
        DockSide::Top => pos.y > work.y + EXIT_THRESHOLD,
    }
}

/// 窗口是否已同时远离左/右/上三条边缘（解除拖动冷却的判定）
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
    let near_top = pos.y <= work.y + EXIT_THRESHOLD;
    !near_left && !near_right && !near_top
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
                // 展开态：光标离开窗口并持续 COLLAPSE_AFTER_MS → 发起收回（先播滑出动画）。
                // 不直接缩窗：把阶段置为 Collapsing，仅发 dock-changed 通知前端播动画，
                // 窗体保持展开全尺寸让动画可见；前端动画结束后回调 dock_collapse 才真正缩条。
                Some((DockPhase::Expanded, side)) => {
                    if cursor_outside(&win, &app_handle) {
                        let start = outside_since.get_or_insert_with(std::time::Instant::now);
                        if start.elapsed().as_millis() >= COLLAPSE_AFTER_MS {
                            outside_since = None;
                            let mut docks = lock_docks(state.inner());
                            if let Some(d) = docks.get_mut(&label) {
                                if d.phase == DockPhase::Expanded {
                                    d.phase = DockPhase::Collapsing;
                                    drop(docks);
                                    emit_dock_changed(&app_handle, &label, "collapsing", Some(side));
                                }
                            }
                        }
                    } else {
                        outside_since = None;
                    }
                }
                // 收回动画播放中：窗体仍是展开全尺寸，等前端动画结束回调 dock_collapse。
                // 期间光标若重新移入窗口则取消收回、回到展开态。
                Some((DockPhase::Collapsing, side)) => {
                    if !cursor_outside(&win, &app_handle) {
                        let mut docks = lock_docks(state.inner());
                        if let Some(d) = docks.get_mut(&label) {
                            if d.phase == DockPhase::Collapsing {
                                d.phase = DockPhase::Expanded;
                                drop(docks);
                                emit_dock_changed(&app_handle, &label, "expanded", Some(side));
                            }
                        }
                    }
                    outside_since = None;
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
            let geo = {
                let docks = lock_docks(state.inner());
                docks.get(&label).map(|d| (d.side, d.normal_pos, d.normal_size))
            };
            if let Some((side, normal_pos, normal_size)) = geo {
                let _ = window.set_size_constraints(loose_constraints());
                if let Some(monitor) = window.current_monitor().ok().flatten() {
                    let (cpos, csize) = collapsed_geometry(&monitor, side, normal_pos, normal_size);
                    let _ = window.set_position(cpos);
                    let _ = window.set_size(csize);
                }
            }
            true
        }
        // 展开态 / 收回动画中：show 后维持现状即可（窗体仍是展开全尺寸）
        Some(DockPhase::Expanded) | Some(DockPhase::Collapsing) => true,
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

/// 前端在 DOM 准备好后回调此命令，执行真正的窗口几何展开
#[tauri::command]
pub fn dock_apply_expand(label: String, app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("窗口不存在: {label}"))?;
    let state = app.state::<AppState>();
    let (side, normal_pos, normal_size) = {
        let docks = lock_docks(state.inner());
        match docks.get(&label) {
            Some(d) => (d.side, d.normal_pos, d.normal_size),
            None => return Ok(()),
        }
    };
    apply_expand_geometry(&app, &window, side, normal_pos, normal_size);
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

/// 查询窗口吸附状态：normal / collapsed / expanded / collapsing
#[tauri::command]
pub fn get_dock_state(label: String, app: AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();
    let docks = lock_docks(state.inner());
    let phase = match docks.get(&label).map(|d| d.phase) {
        Some(DockPhase::Collapsed) => "collapsed",
        Some(DockPhase::Expanded) => "expanded",
        Some(DockPhase::Collapsing) => "collapsing",
        None => "normal",
    };
    Ok(phase.to_string())
}
