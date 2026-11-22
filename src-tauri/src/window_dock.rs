//! 侧边吸附（贴边收缩）：把窗口拖到屏幕左/右/上边缘并松手后收缩为细条，
//! 鼠标悬停展开、离开后延迟收回、展开后拖离边缘退出吸附（QQ 模式）。
//! 拖动过程中不判定吸附，避免多显示器跨屏时被中途的屏幕边界吸走；
//! 松手后先把窗口完整弹回工作区，等鼠标离开窗口再自动收起吸附。
//! 底边不参与（与任务栏抢区域）。对两个弹幕小窗（直播弹幕窗 danmaku / 视频弹幕窗 video-danmaku）生效，其它窗口不参与。

use crate::window_state::{DANMAKU_MAX_H, DANMAKU_MAX_W, DANMAKU_MIN_H, DANMAKU_MIN_W};
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
    /// 展开几何是否已被应用（前端 dock_apply_expand 或兜底任务）。
    /// 兜底任务据此跳过已确认的展开，避免前端正在播滑入动画时重复 set_size/set_position。
    pub geometry_applied: bool,
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

/// 收缩条基准宽度（逻辑像素，100% 缩放下的宽度）。
/// 太窄不好命中，尤其收起条不可见时全靠鼠标碰到；保留 14px 兼顾观感与易碰。
const DOCK_WIDTH: u32 = 14;
/// 收缩条固定长度（物理像素）：左右条的高度 / 顶条的宽度，居中于原窗口位置
const COLLAPSED_LENGTH: u32 = 150;

/// 收缩条实际宽度（物理像素）：按显示器缩放换算，保证高 DPI 下逻辑宽度稳定、可点中。
/// scale_factor 异常时回退为 1.0。
fn dock_width_px(monitor: &tauri::Monitor) -> u32 {
    (DOCK_WIDTH as f64 * monitor.scale_factor()).round().max(1.0) as u32
}
/// 进入吸附的边缘距离阈值（物理像素）
const ENTER_THRESHOLD: i32 = 12;
/// 退出吸附的边缘距离阈值（滞回，大于进入阈值）
const EXIT_THRESHOLD: i32 = 28;
/// 松手后的停稳判定：窗口位置连续稳定该时长才允许进入吸附。
/// 多显示器拖动跨过屏幕交界时，窗口会短暂贴住内部边界；若只按光标离开/贴边
/// 立即判定，会在拖动途中就触发吸附。先要求窗口停稳，再按最终位置决定。
const SETTLE_AFTER_MS: u128 = 200;

/// 光标轮询间隔（毫秒）：吸附各态需要收回延迟判定精度，用高频；
/// normal 态只做贴边检测，用低频降低常驻空转开销
const POLL_INTERVAL_MS: u64 = 50;
const POLL_INTERVAL_IDLE_MS: u64 = 100;
/// 光标持续在窗口外多久后收回（毫秒）
const COLLAPSE_AFTER_MS: u128 = 250;

/// 各窗口光标轮询任务的停止标志（label -> stop flag）
static POLL_TASKS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn poll_tasks() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    POLL_TASKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn lock_poll_tasks() -> MutexGuard<'static, std::collections::HashMap<String, Arc<AtomicBool>>> {
    poll_tasks().lock().unwrap_or_else(|e| e.into_inner())
}

/// 停止某窗口的轮询任务（若存在）
fn stop_polling(label: &str) {
    if let Some(flag) = lock_poll_tasks().remove(label) {
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

/// 收缩态的几何：贴死所在边缘、居中于原窗口位置。
/// normal_pos/normal_size 为吸附前记录的原窗口外框位置与尺寸。
///
/// `full_span` 决定收缩后的长度：
/// - false（收起条可见）：固定短条 COLLAPSED_LENGTH，居中于原窗口
/// - true（收起条关闭、整条不可见）：铺满原窗口在该边缘方向上的完整跨度
///   （左右吸附用原窗口高度、顶部吸附用原窗口宽度），命中区随之变大，看不见也好碰
///
/// 返回 (position, size)，供 enter_dock / collapse_dock / restore_if_docked 统一使用。
fn collapsed_geometry(
    monitor: &tauri::Monitor,
    side: DockSide,
    normal_pos: PhysicalPosition<i32>,
    normal_size: PhysicalSize<u32>,
    full_span: bool,
) -> (PhysicalPosition<i32>, PhysicalSize<u32>) {
    let work = monitor.position();
    let work_size = monitor.size();
    let dock_w = dock_width_px(monitor);

    if side == DockSide::Top {
        let eff_w = normal_size.width.min(work_size.width);
        let eff_x = normal_pos
            .x
            .clamp(work.x, work.x + work_size.width as i32 - eff_w as i32);
        let w = if full_span {
            eff_w
        } else {
            (COLLAPSED_LENGTH as usize).min(work_size.width as usize) as u32
        };
        // 居中于原窗口中心（full_span 时原窗口宽度即条长，与 eff_x 对齐）
        let center_x = eff_x + eff_w as i32 / 2;
        let x = (center_x - w as i32 / 2).clamp(work.x, work.x + work_size.width as i32 - w as i32);
        return (PhysicalPosition::new(x, work.y), PhysicalSize::new(w, dock_w));
    }

    // 垂直居中于原窗口中心，再夹回工作区内。
    // 必须用与 expand_dock 一致的 clamp 后几何算中心：expand_dock 会把高度钳到工作区、
    // 把 y 钳到工作区内，若这里直接用未 clamp 的 normal_pos/normal_size，当窗口顶部拖出屏
    // 或比工作区高时，收缩条会与它展开出的窗口垂直中心错开（固定偏移），居中不变量失效。
    let eff_h = normal_size.height.min(work_size.height);
    let eff_y = normal_pos
        .y
        .clamp(work.y, work.y + work_size.height as i32 - eff_h as i32);
    let h = if full_span {
        eff_h
    } else {
        (COLLAPSED_LENGTH as usize).min(work_size.height as usize) as u32
    };
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

/// 该 label 是否参与吸附（仅常驻弹幕窗口 danmaku）。
/// 主页面窗口不参与：它是常规管理窗口、非置顶，吸附条会被其它窗口盖住，
/// 且任务栏 hide/show 还原路径与吸附态冲突（曾导致还原后窗口错乱的恶性 bug）。
/// 弹幕窗口 transparent + always_on_top，走托盘 hide/show（restore_if_docked 覆盖），吸附稳定。
fn is_dockable(label: &str) -> bool {
    // 直播弹幕窗与视频弹幕窗是同一「弹幕小窗」的两种内容形态，吸附交互完全一致
    label == crate::commands::room::DANMAKU_WINDOW_LABEL
        || label == crate::commands::video_window::LABEL
}

/// 窗口销毁时清理该 label 的吸附残留：DockState、拖动冷却、轮询任务。
/// 弹幕窗口 label 固定为 danmaku，退出直播间销毁窗口后再次进入会以同 label
/// 重建，若不清理，轮询会读到上一世残留的陈旧相位，把新窗口误当吸附态驱动
/// （搬到旧边缘/压成细条）。
pub fn cleanup(label: &str, app: &AppHandle) {
    if !is_dockable(label) {
        return;
    }
    let state = app.state::<AppState>();
    lock_docks(state.inner()).remove(label);
    lock_cooldowns(state.inner()).remove(label);
    stop_polling(label);
}

/// 窗口当前的「正常几何」（物理像素）：吸附中（细条/展开预览/收回动画）的窗口
/// 几何不是用户摆放结果，返回 DockState 记录的吸附前位置与尺寸；未吸附返回
/// 当前外框位置与尺寸。供窗口几何持久化（window_state）取值。
pub fn normal_geometry(
    window: &WebviewWindow,
    app: &AppHandle,
) -> Option<(PhysicalPosition<i32>, PhysicalSize<u32>)> {
    let state = app.state::<AppState>();
    if let Some(docked) = lock_docks(state.inner()).get(window.label()) {
        return Some((docked.normal_pos, docked.normal_size));
    }
    Some((window.outer_position().ok()?, window.outer_size().ok()?))
}

/// 进入吸附：记录（已夹回工作区的）正常几何，收缩为贴边细条。
/// 松手时窗口可能还停在屏外一段距离，记录恢复基准前先夹回工作区，
/// 否则之后展开/退出吸附会把越界位置带回来。
fn enter_dock(app: &AppHandle, window: &WebviewWindow, side: DockSide) {
    let state = app.state::<AppState>();
    let label = window.label().to_string();
    log::info!("[dock] 进入吸附: {label} side={side:?}");

    let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return;
    };
    let (x, y) = crate::window_state::clamp_into_work_area(
        window,
        pos.x,
        pos.y,
        size.width as i32,
        size.height as i32,
    );
    let pos = PhysicalPosition::new(x, y);
    let Some(monitor) = crate::window_state::monitor_for_rect(
        window,
        pos.x,
        pos.y,
        size.width as i32,
        size.height as i32,
    ) else {
        return;
    };

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
                geometry_applied: false,
            },
        );
    }

    // 放宽尺寸约束才能缩成细条
    let _ = window.set_size_constraints(loose_constraints());

    // 收缩为细条：贴死边缘、居中于原窗口位置（收起条关闭时铺满原窗口跨度）
    let full_span = !state.dock_enabled.load(Ordering::Relaxed);
    let (cpos, csize) = collapsed_geometry(&monitor, side, pos, size, full_span);
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
                // 新一轮展开：清除上一轮的应用确认，兜底任务据此重新接管
                d.geometry_applied = false;
                (d.side, d.normal_pos, d.normal_size)
            }
            _ => return,
        }
    };

    emit_dock_changed(app, &label, "expanded", Some(side));

    // 兜底：仅当前端迟迟未回调 dock_apply_expand（webview 无响应）时才代为应用几何。
    // apply_expand_geometry 内部检查 geometry_applied：前端已确认应用则直接跳过，
    // 不会在其播放滑入动画期间重复 set_size/set_position 造成闪扰。
    // 超时放宽到 1s：正常展开要等前端重挂载主内容（重列表可达数百毫秒），
    // 兜底抢先扩窗会把仍在渲染的收缩条拉伸成全尺寸（闪一下）。
    let app_clone = app.clone();
    let label_clone = label.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
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

    // 竞态守卫：仅在 Expanded 态应用几何（可能已被 collapse/exit 取消）；
    // 已应用过则跳过（重复应用无意义，且可能干扰前端正在播放的滑入动画）
    {
        let mut docks = lock_docks(state.inner());
        match docks.get_mut(&label) {
            Some(d) if d.phase == DockPhase::Expanded => {
                if d.geometry_applied {
                    return;
                }
                d.geometry_applied = true;
            }
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

    // 收缩为细条：贴死边缘、居中于原窗口位置（收起条关闭时铺满原窗口跨度）。
    // 用吸附前记录的 normal_size 算垂直中心（与 enter_dock/restore_if_docked 口径一致），
    // 否则展开被钳高（窗口比工作区高）时，进入与收回的收缩条位置会不一致而上下跳。
    let full_span = !state.dock_enabled.load(Ordering::Relaxed);
    let (cpos, csize) = collapsed_geometry(&monitor, side, normal_pos, normal_size, full_span);
    // 先 set_size 再 set_position：与 expand_dock 同理，避免右缘收回的中间几何被
    // Moved 处理器误判为"拖离边缘"。收回仅在 Expanded 态触发，此处为防御。
    let _ = window.set_size(csize);
    let _ = window.set_position(cpos);

    emit_dock_changed(app, &label, "collapsed", Some(side));
}

/// 收起条开关切换后重算收缩态几何：关闭时命中区要铺满原窗口跨度，
/// 开启后收回固定短条。仅当窗口正处于 Collapsed 态才动作。
pub fn refresh_collapsed_geometry(app: &AppHandle, window: &WebviewWindow) {
    let label = window.label().to_string();
    let state = app.state::<AppState>();
    let geo = {
        let docks = lock_docks(state.inner());
        docks
            .get(&label)
            .filter(|d| d.phase == DockPhase::Collapsed)
            .map(|d| (d.side, d.normal_pos, d.normal_size))
    };
    let Some((side, normal_pos, normal_size)) = geo else { return };
    let Some(monitor) = window.current_monitor().ok().flatten() else { return };
    let full_span = !state.dock_enabled.load(Ordering::Relaxed);
    let (cpos, csize) = collapsed_geometry(&monitor, side, normal_pos, normal_size, full_span);
    let _ = window.set_size(csize);
    let _ = window.set_position(cpos);
}

/// 隐身模式与吸附互斥：隐身态下窗口点击穿透，吸附条既无法悬停展开，
/// 收缩态也只剩一条不可交互的细条。开启隐身前调用本函数把窗口恢复为
/// 完整几何并退出吸附（可能处于 Collapsed / Expanded / Collapsing）。
pub fn exit_dock_for_full_window(app: &AppHandle, window: &WebviewWindow) {
    let state = app.state::<AppState>();
    let label = window.label().to_string();

    let geo = {
        let mut docks = lock_docks(state.inner());
        docks.remove(&label).map(|d| {
            (d.side, d.normal_pos, d.normal_size, d.phase)
        })
    };
    let Some((_side, normal_pos, normal_size, phase)) = geo else {
        return;
    };

    // 收起态/收回动画中：几何还停在细条上，先还原成吸附前的完整窗口
    if phase != DockPhase::Expanded {
        let _ = window.set_size(PhysicalSize::new(normal_size.width, normal_size.height));
        let _ = window.set_position(normal_pos);
    }

    // 进入拖动冷却：与 exit_dock 一致，避免贴边时被轮询立刻重新吸附
    lock_cooldowns(state.inner()).insert(label.clone());
    let _ = window.set_size_constraints(normal_constraints());
    emit_dock_changed(app, &label, "normal", None);
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

/// 光标位置与窗口外框矩形（cx, cy, left, top, right, bottom）。
/// 任一几何/光标获取失败返回 None，调用方各自决定失败语义。
fn cursor_window_geometry(
    window: &WebviewWindow,
    app: &AppHandle,
) -> Option<(f64, f64, f64, f64, f64, f64)> {
    let cursor = app.cursor_position().ok()?;
    let pos = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;

    let left = pos.x as f64;
    let top = pos.y as f64;
    Some((
        cursor.x,
        cursor.y,
        left,
        top,
        left + size.width as f64,
        top + size.height as f64,
    ))
}

/// 光标是否已离开窗口区域（展开态收回判定的辅助信号）。
/// 获取失败按"未离开"处理，避免误发起收回。
fn cursor_outside(window: &WebviewWindow, app: &AppHandle) -> bool {
    match cursor_window_geometry(window, app) {
        Some((cx, cy, left, top, right, bottom)) => {
            cx < left || cx >= right || cy < top || cy >= bottom
        }
        None => false,
    }
}

/// 主鼠标键是否仍按住（Windows 全局查询）。
/// 拖动跨屏时窗口可能短暂贴住显示器交界，而窗口跟随有延迟、光标会瞬时跑到
/// 窗口外；此时只看几何会误判成"已松手"。按键仍按下就不做松手/吸附判定，
/// 保证拖动途中不触发回弹或吸附。非 Windows 平台没有等价查询，退回停稳判定。
#[cfg(target_os = "windows")]
fn primary_button_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    unsafe { (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000) != 0 }
}

#[cfg(not(target_os = "windows"))]
fn primary_button_down() -> bool {
    false
}

/// 拖动结束判定：区分「拖动经过屏幕边界」和「拖动结束停在边界」。
/// 轮询每个 tick 调用 [`DragSettle::observe`]；拖动期间发生过移动、
/// 随后主键松开且窗口位置稳定 `SETTLE_AFTER_MS`，才算一次拖动结束（released），
/// 用于把窗口弹回工作区。吸附另由「光标离开窗口 + 贴边」决定。
struct DragSettle {
    last_position: Option<PhysicalPosition<i32>>,
    settled_since: std::time::Instant,
    armed: bool,
}

/// 一次轮询的拖动状态。
struct DragObservation {
    /// 本次 tick 是否为某次拖动的结束（只返回一次）
    released: bool,
    /// 窗口位置是否已停稳；吸附仍要求光标离开窗口，停稳用于排除拖动途中
    settled: bool,
}

impl DragSettle {
    fn new(now: std::time::Instant) -> Self {
        Self {
            last_position: None,
            settled_since: now,
            armed: false,
        }
    }

    /// 丢弃待判定状态（进入仅输入框/隐身/冷却，或已消费本次拖动时调用）。
    fn disarm(&mut self) {
        self.armed = false;
    }

    /// 回弹等程序性移动后同步基准位置，避免下一帧把它当成一次新的拖动。
    fn note_programmatic_position(
        &mut self,
        position: PhysicalPosition<i32>,
        now: std::time::Instant,
    ) {
        self.last_position = Some(position);
        self.settled_since = now;
        self.armed = false;
    }

    /// 记录一次轮询：`released` 表示一次拖动刚结束，`settled` 表示窗口已停稳。
    /// `released` 返回 true 时会消费待判定状态，保证一次拖动只判定一次。
    fn observe(
        &mut self,
        position: Option<PhysicalPosition<i32>>,
        button_down: bool,
        now: std::time::Instant,
    ) -> DragObservation {
        let moved = match (self.last_position, position) {
            (Some(previous), Some(current)) => previous != current,
            _ => false,
        };
        // 首帧也要落位，否则后续永远没有可比较的基准
        if position.is_some() {
            self.last_position = position;
        }
        if moved {
            self.settled_since = now;
            // 位置变化即视为一次拖动/移动；是否真正进入吸附由后面的
            // 「主键已松开 + 停稳 + 光标离开窗口」共同决定。
            self.armed = true;
        }

        let settled = now.duration_since(self.settled_since).as_millis() >= SETTLE_AFTER_MS;
        let released = self.armed && !button_down && settled;
        if released {
            self.armed = false;
        }
        DragObservation { released, settled }
    }
}

/// 光标是否落在窗口区域内（用于收缩条悬停展开的后端判定）。
/// 所有取几何/光标失败的路径一律返回 false，避免误判"在窗口内"而误触发展开。
fn cursor_over_window(window: &WebviewWindow, app: &AppHandle) -> bool {
    match cursor_window_geometry(window, app) {
        Some((cx, cy, left, top, right, bottom)) => {
            cx >= left && cx < right && cy >= top && cy < bottom
        }
        None => false,
    }
}

/// 判定矩形是否贴到屏幕左/右/上边缘（不含底）。返回 Some(side) 表示应进入吸附。
/// 贴边语义对齐 QQ：窗口边缘"碰到或越过"屏幕边缘即算贴边，
/// 允许窗口被拖出屏幕外一段距离（此时窗口边缘已在屏幕外侧，仍视为贴边）。
/// 角落归属左右优先：同时贴近左/右与上时归左右，顶吸仅在未贴左右时生效。
fn detect_edge_in(
    work: PhysicalPosition<i32>,
    work_size: PhysicalSize<u32>,
    pos: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
) -> Option<DockSide> {
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

/// 松手后把窗口完整弹回工作区，保持正常窗口形态。
/// 这一步不进入吸附：吸附仍由后续「光标离开窗口」判定触发，
/// 所以松手后窗口先完整显示，鼠标移开后才收起。
/// 返回新的落点（未移动时 None），供调用方同步拖动跟踪基准。
fn bounce_back_into_work_area(window: &WebviewWindow) -> Option<PhysicalPosition<i32>> {
    let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return None;
    };
    let (x, y) = crate::window_state::clamp_into_work_area(
        window,
        pos.x,
        pos.y,
        size.width as i32,
        size.height as i32,
    );
    if x == pos.x && y == pos.y {
        return None;
    }
    let target = PhysicalPosition::new(x, y);
    let _ = window.set_position(target);
    Some(target)
}

/// 松手后光标是否真的移动过。
/// 回弹会把窗口相对光标的位置挪到屏幕边界，光标可能恰好落在窗口外侧，
/// 仅凭 cursor_outside 会立刻判定为「已移开」；要求至少移动一小段距离。
fn cursor_moved_since(app: &AppHandle, origin: Option<PhysicalPosition<f64>>) -> bool {
    let Some(origin) = origin else { return true };
    let Ok(current) = app.cursor_position() else { return true };
    (current.x - origin.x).abs() + (current.y - origin.y).abs() > 6.0
}

/// 按窗口中心所在显示器判定是否贴边。
/// 用中心所在显示器而不是 current_monitor，避免多屏内部边界上窗口跨在
/// 两块屏幕之间时判定到错误的那一块，漏掉内部边缘的吸附。
fn detect_edge_for_window(window: &WebviewWindow) -> Option<DockSide> {
    let pos = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    let monitor = crate::window_state::monitor_for_rect(
        window,
        pos.x,
        pos.y,
        size.width as i32,
        size.height as i32,
    )?;
    detect_edge_in(*monitor.position(), *monitor.size(), pos, size)
}

/// 窗口是否已拖离所在边缘（退出吸附判定，滞回阈值）
fn dragged_off_edge(window: &WebviewWindow, side: DockSide) -> bool {
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
/// - 进入吸附（松手贴边）与展开收回（光标离开）由轮询驱动：
///   Moved 在拖动中持续触发且松手后停止，无法区分是否松手；
///   轮询结合窗口位置停稳与鼠标按键状态做判定。
pub fn attach(window: &WebviewWindow, app: &AppHandle) {
    if !is_dockable(window.label()) {
        return;
    }
    log::info!("[dock] 挂接吸附: {}", window.label());
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
                if dragged_off_edge(&win, side) {
                    exit_dock(&app_handle, &win);
                }
            }
        }
    });

    start_polling(window, app);
}

/// 启动该窗口的光标轮询：驱动"松手回弹"、"光标离开窗口后贴边吸附"与
/// "光标离开展开窗口收回"。
fn start_polling(window: &WebviewWindow, app: &AppHandle) {
    let label = window.label().to_string();
    stop_polling(&label); // 防御：先停掉同名旧任务

    let stop = Arc::new(AtomicBool::new(false));
    lock_poll_tasks().insert(label.clone(), stop.clone());

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        // 光标持续在窗口外的累计时间（用于收回延迟）
        let mut outside_since: Option<std::time::Instant> = None;
        // 窗口位置停稳 + 拖动结束判定：拖动途中窗口会跟随光标移动，跨屏时还会
        // 短暂贴住显示器内部边界；只有拖动结束且位置稳定后才允许进入吸附
        let mut drag_settle = DragSettle::new(std::time::Instant::now());
        // 松手时的光标位置：回弹后再要求光标真正移动过，才允许吸附
        let mut released_cursor: Option<PhysicalPosition<f64>> = None;

        let mut first_tick = true;
        loop {
            if stop.load(Ordering::Relaxed) {
                break;
            }

            let Some(win) = app_handle.get_webview_window(&label) else {
                break;
            };
            if !win.is_visible().unwrap_or(false) {
                continue;
            }
            let state = app_handle.state::<AppState>();
            if first_tick {
                first_tick = false;
                log::info!("[dock] 轮询启动: {label}");
            }

            let current = {
                let docks = lock_docks(state.inner());
                docks.get(&label).map(|d| (d.phase, d.side))
            };

            // 分级：仅 normal 态可低频（只做贴边检测），吸附各态保持高频
            let interval_ms = match current {
                None => POLL_INTERVAL_IDLE_MS,
                _ => POLL_INTERVAL_MS,
            };
            tokio::time::sleep(std::time::Duration::from_millis(interval_ms)).await;

            let button_down = primary_button_down();
            let drag = drag_settle.observe(
                win.outer_position().ok(),
                button_down,
                std::time::Instant::now(),
            );

            match current {
                // 正常态：松手先弹回工作区（保持完整窗口），之后光标离开窗口
                // 且窗口停稳、贴边时才进入吸附。拖动途中绝不吸附，避免多屏
                // 跨边界时被中途的屏幕边界吸走。
                None => {
                    // 仅输入框模式不参与吸附（进入该模式时会先解除既有吸附）。
                    // 按窗口 label 读各自的标志：直播窗 danmaku_input_only / 视频窗 video_input_only
                    if crate::window_state::input_only_active(state.inner(), &label) {
                        drag_settle.disarm();
                        released_cursor = None;
                        outside_since = None;
                        continue;
                    }
                    // 隐身模式不参与吸附：开启时会主动退出吸附，这里兜底防止
                    // 隐身期间窗口点击穿透、吸附交互全部失效
                    if crate::window_stealth::is_active(state.inner(), &label) {
                        drag_settle.disarm();
                        released_cursor = None;
                        outside_since = None;
                        continue;
                    }
                    // 松手：把窗口完整弹回工作区，但不立即吸附
                    if drag.released {
                        if let Some(target) = bounce_back_into_work_area(&win) {
                            drag_settle
                                .note_programmatic_position(target, std::time::Instant::now());
                        }
                        released_cursor = app_handle.cursor_position().ok();
                    }
                    let in_cooldown = lock_cooldowns(state.inner()).contains(&label);
                    if in_cooldown {
                        // 冷却中：拖离三条边缘后解除冷却；期间的拖动不保留待判定状态
                        drag_settle.disarm();
                        released_cursor = None;
                        if far_from_edges(&win) {
                            lock_cooldowns(state.inner()).remove(&label);
                        }
                    } else if !drag.released
                        && drag.settled
                        && !button_down
                        && cursor_outside(&win, &app_handle)
                        && cursor_moved_since(&app_handle, released_cursor)
                    {
                        // 鼠标已移开窗口，且窗口停稳、贴边 → 自动收起吸附
                        if let Some(side) = detect_edge_for_window(&win) {
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
                                    // 兜底：前端依赖 transform transitionend 回调 dock_collapse，
                                    // 任何样式覆盖/动画被禁用都可能丢事件；1s 后仍在 Collapsing
                                    // 则后端自行收起（collapse_dock 会复核光标仍在窗外）。
                                    let fallback_app = app_handle.clone();
                                    let fallback_label = label.clone();
                                    tauri::async_runtime::spawn(async move {
                                        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
                                        let Some(win) = fallback_app.get_webview_window(&fallback_label) else { return };
                                        let still_collapsing = {
                                            let state = fallback_app.state::<AppState>();
                                            let docks = lock_docks(state.inner());
                                            docks.get(&fallback_label).map(|d| d.phase) == Some(DockPhase::Collapsing)
                                        };
                                        if still_collapsing {
                                            log::info!("[dock] 收起回调超时，后端兜底: {fallback_label}");
                                            collapse_dock(&fallback_app, &win);
                                        }
                                    });
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
                    let full_span = !app.state::<AppState>().dock_enabled.load(Ordering::Relaxed);
                    let (cpos, csize) = collapsed_geometry(&monitor, side, normal_pos, normal_size, full_span);
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

/// 查询窗口吸附状态：phase + side 一起返回。
/// side 必须随查询返回：webview 挂载可能晚于吸附事件（如贴边状态下退出重进，
/// 窗口原生层先显示，轮询几十毫秒内就自动吸附并广播事件，而此时 React 监听器
/// 尚未就绪，事件丢失）——前端只能靠本命令同步初始状态，side 缺失会把
/// 右缘/顶缘的吸附条按默认 left 渲染，圆角朝向与指示线方向全部镜像。
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockStateSnapshot {
    pub phase: String,
    pub side: Option<DockSide>,
}

/// 查询窗口吸附状态
#[tauri::command]
pub fn get_dock_state(label: String, app: AppHandle) -> Result<DockStateSnapshot, String> {
    let state = app.state::<AppState>();
    let docks = lock_docks(state.inner());
    Ok(match docks.get(&label) {
        Some(d) => DockStateSnapshot {
            phase: match d.phase {
                DockPhase::Collapsed => "collapsed",
                DockPhase::Expanded => "expanded",
                DockPhase::Collapsing => "collapsing",
            }
            .to_string(),
            side: Some(d.side),
        },
        None => DockStateSnapshot {
            phase: "normal".to_string(),
            side: None,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::{detect_edge_in, DragSettle, DockSide, SETTLE_AFTER_MS};
    use std::time::{Duration, Instant};
    use tauri::{PhysicalPosition, PhysicalSize};

    fn at(x: i32, y: i32) -> Option<PhysicalPosition<i32>> {
        Some(PhysicalPosition::new(x, y))
    }

    #[test]
    fn stationary_window_never_arms_docking() {
        let t0 = Instant::now();
        let mut settle = DragSettle::new(t0);
        assert!(!settle.observe(at(100, 100), false, t0).released);
        assert!(!settle.observe(at(100, 100), false, t0 + Duration::from_secs(1)).released);
    }

    #[test]
    fn drag_across_monitor_boundary_only_fires_after_release() {
        let t0 = Instant::now();
        let mut settle = DragSettle::new(t0);
        assert!(!settle.observe(at(100, 100), false, t0).released);

        // 拖动经过显示器交界：位置持续变化，按住期间始终不算松手
        for (index, x) in [300, 500, 700, 900].into_iter().enumerate() {
            let t = t0 + Duration::from_millis(50 * (index as u64 + 1));
            assert!(!settle.observe(at(x, 100), true, t).released, "拖动途中不应判定松手");
        }

        // 停在交界处继续按住：仍然不算松手
        let held = t0 + Duration::from_millis(500);
        assert!(!settle.observe(at(900, 100), true, held).released, "按住不动也不应判定松手");

        // 松手：窗口早已停稳，回弹判定立即生效
        let released = t0 + Duration::from_millis(550);
        assert!(settle.observe(at(900, 100), false, released).released, "松手后应触发回弹");

        // 一次拖动只判定一次
        assert!(!settle.observe(at(900, 100), false, released + Duration::from_secs(1)).released);
    }

    #[test]
    fn edge_detection_prefers_left_right_then_top() {
        let work = PhysicalPosition::new(0, 0);
        let work_size = PhysicalSize::new(1920, 1080);
        let size = PhysicalSize::new(400, 300);
        assert_eq!(
            detect_edge_in(work, work_size, PhysicalPosition::new(0, 500), size),
            Some(DockSide::Left)
        );
        assert_eq!(
            detect_edge_in(work, work_size, PhysicalPosition::new(1520, 500), size),
            Some(DockSide::Right)
        );
        assert_eq!(
            detect_edge_in(work, work_size, PhysicalPosition::new(700, 0), size),
            Some(DockSide::Top)
        );
        assert_eq!(
            detect_edge_in(work, work_size, PhysicalPosition::new(700, 400), size),
            None
        );
        // 左侧与顶部同时命中时左右优先
        assert_eq!(
            detect_edge_in(work, work_size, PhysicalPosition::new(0, 0), size),
            Some(DockSide::Left)
        );
    }

    #[test]
    fn release_within_one_poll_still_arms() {
        let t0 = Instant::now();
        let mut settle = DragSettle::new(t0);
        assert!(!settle.observe(at(100, 100), false, t0).released);

        // 按下但这一帧还没移动
        let pressed = t0 + Duration::from_millis(100);
        assert!(!settle.observe(at(100, 100), true, pressed).released);

        // 两帧之间完成移动并松手：位置变化仍会记录，停稳后再判定
        let moved = pressed + Duration::from_millis(100);
        assert!(!settle.observe(at(900, 100), false, moved).released);

        let settled = moved + Duration::from_millis(SETTLE_AFTER_MS as u64);
        assert!(settle.observe(at(900, 100), false, settled).released);
    }
}
