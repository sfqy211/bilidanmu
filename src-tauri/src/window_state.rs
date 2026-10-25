//! 弹幕窗口几何（位置 + 尺寸）持久化：在 Rust 侧统一保存/恢复，取代早期前端 localStorage 方案。
//!
//! 单位口径：
//! - 尺寸持久化为逻辑像素。物理像素只存在于事件与外框查询的瞬间，落盘前换算
//!   （outer_size / scale_factor），恢复时经 inner_size（逻辑）应用，与窗口创建、
//!   吸附约束的单位语义一致。旧方案「时大时小」的根因即单位错配：前端 onResized
//!   存物理像素，创建按逻辑像素解释，DPI≠100% 时每次重开按缩放复利放大。
//! - 位置持久化为物理像素。全局坐标属于虚拟屏幕坐标系，天然以物理像素为准，
//!   除以单块显示器的缩放系数没有全局意义（跨屏即错位），故 x/y 不做缩放换算，
//!   恢复时以 set_position(Physical) 原样应用。恢复前校验坐标仍落在某块显示器内，
//!   显示器配置变化（拔线/改布局）导致坐标失效时回退系统默认定位。
//!
//! 保存时机：全局 on_window_event 的 Resized/Moved 事件，防抖后取停稳几何；
//! 吸附各态（细条/展开预览）的几何不是用户摆放结果，改存 DockState 记录的吸附前几何；
//! 窗口销毁路径（exit_room / 托盘退出）在 destroy 前同步 flush。
//! 越界尺寸（瞬态占位/销毁瞬间的异常几何）不落盘；尺寸恢复时整对校验，
//! 任一维越界整组弃用，杜绝「宽回退默认、高保留脏值」的细长条。

use crate::{commands::room::DANMAKU_WINDOW_LABEL, selections_store, window_dock, AppState};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewWindow};

/// 弹幕窗口正常尺寸约束（逻辑像素）：创建窗口、吸附约束、持久化校验共用同一来源
pub const DANMAKU_MIN_W: f64 = 240.0;
pub const DANMAKU_MIN_H: f64 = 160.0;
pub const DANMAKU_MAX_W: f64 = 1200.0;
pub const DANMAKU_MAX_H: f64 = 900.0;

/// 「仅输入框」紧凑模式约束（逻辑像素）：高度锁定为输入栏一行，宽度可调
pub const INPUT_ONLY_H: f64 = 48.0;
pub const INPUT_ONLY_MIN_W: f64 = 240.0;
pub const INPUT_ONLY_MAX_W: f64 = 520.0;
/// 无保存值时紧凑模式默认宽
pub const INPUT_ONLY_DEFAULT_W: f64 = 360.0;
/// 「仅输入框」表情面板临时尺寸（逻辑像素）：展开时窗口从输入栏位置向上变形
pub const INPUT_ONLY_EMOTE_W: f64 = 360.0;
pub const INPUT_ONLY_EMOTE_H: f64 = 400.0;

/// 几何在 app_metadata 表中的键
const GEOMETRY_KEY: &str = "danmaku_window_geometry";
/// Resized/Moved 事件防抖：拖拽/DPI 切换/吸附动画期间事件密集，只认停稳后的最后一次
const DEBOUNCE_MS: u64 = 300;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
struct SavedGeometry {
    /// 物理像素全局坐标
    #[serde(default)]
    position: Option<(i32, i32)>,
    /// 完整模式的宽高（逻辑像素）；旧数据必填，新数据按模式只写对应一侧
    #[serde(default)]
    width: Option<f64>,
    #[serde(default)]
    height: Option<f64>,
    /// 当前是否「仅输入框」紧凑模式
    #[serde(default)]
    input_only: bool,
    /// 紧凑模式的宽度（逻辑像素），高度恒为 INPUT_ONLY_H
    #[serde(default)]
    input_only_width: Option<f64>,
}

/// 已保存几何的恢复视图。位置为 None 表示无保存值或坐标已不在任何显示器内，
/// 调用方回退系统默认定位；尺寸为 None 同理回退默认尺寸。
pub struct RestoredGeometry {
    pub size: Option<(f64, f64)>,
    pub position: Option<(i32, i32)>,
    /// 是否「仅输入框」紧凑模式
    pub input_only: bool,
    /// 紧凑模式尺寸（宽已过约束校验，高恒为 INPUT_ONLY_H）；非紧凑模式为 None
    pub input_only_size: Option<(f64, f64)>,
}

/// 防抖序号：每次几何事件递增，落盘任务醒来时序号已被超越则说明有更新事件接棒
static GEOMETRY_SEQ: AtomicU64 = AtomicU64::new(0);

/// Resized/Moved 事件入口（lib.rs 全局 on_window_event 调用，仅弹幕窗口）。
pub fn on_geometry_changed(app: &AppHandle) {
    let seq = GEOMETRY_SEQ.fetch_add(1, Ordering::Relaxed) + 1;
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(DEBOUNCE_MS)).await;
        if GEOMETRY_SEQ.load(Ordering::Relaxed) == seq {
            save_normal_geometry(&app);
        }
    });
}

/// 同步落盘当前正常几何。窗口销毁路径（exit_room / 托盘退出）在 destroy 前调用，
/// 兜底「调整后 300ms 内就退出」导致防抖任务来不及写库的情况。
pub fn save_now(app: &AppHandle) {
    save_normal_geometry(app);
}

/// 读取保存的几何。尺寸整对校验：任一维越界即整组弃用（回退默认尺寸），
/// 杜绝单维度回退拼出细长条；位置独立校验（见 position_on_screen）。
pub fn load_geometry(app: &AppHandle) -> RestoredGeometry {
    let state = app.state::<AppState>();
    let saved = selections_store::load_values(state.inner(), &[GEOMETRY_KEY.to_string()])
        .ok()
        .and_then(|values| values.get(GEOMETRY_KEY).cloned())
        .and_then(|value| serde_json::from_value::<SavedGeometry>(value).ok());

    let mut restored = RestoredGeometry {
        size: None,
        position: None,
        input_only: false,
        input_only_size: None,
    };
    if let Some(saved) = saved {
        // 尺寸整对校验：任一维越界即整组弃用（回退默认尺寸），杜绝单维度回退拼出细长条
        if let (Some(width), Some(height)) = (saved.width, saved.height) {
            if size_in_constraints(width, height) {
                restored.size = Some((width, height));
            } else {
                log::warn!(
                    "弹幕窗口保存尺寸越界，已弃用: {}x{}",
                    width,
                    height
                );
            }
        }
        restored.input_only = saved.input_only;
        if let Some(width) = saved.input_only_width {
            if (INPUT_ONLY_MIN_W..=INPUT_ONLY_MAX_W).contains(&width) {
                restored.input_only_size = Some((width, INPUT_ONLY_H));
            } else {
                log::warn!("弹幕窗口紧凑宽度越界，已弃用: {width}");
            }
        }
        restored.position = saved.position;
    }
    restored
}

/// 校验物理坐标是否落在某块显示器内（恢复前防御显示器配置变化）。
pub fn position_on_screen(window: &WebviewWindow, x: i32, y: i32) -> bool {
    for monitor in window.available_monitors().unwrap_or_default() {
        let mp = monitor.position();
        let ms = monitor.size();
        if x >= mp.x && x < mp.x + ms.width as i32 && y >= mp.y && y < mp.y + ms.height as i32 {
            return true;
        }
    }
    false
}

fn size_in_constraints(width: f64, height: f64) -> bool {
    (DANMAKU_MIN_W..=DANMAKU_MAX_W).contains(&width)
        && (DANMAKU_MIN_H..=DANMAKU_MAX_H).contains(&height)
}

/// 保存弹幕窗口几何：按 AppState 的当前模式分流——完整模式存位置+宽高，
/// 仅输入框存位置+紧凑宽（读-改-写保留另一模式的尺寸字段）。
/// 吸附态的几何不是用户摆放结果，仍由 window_dock::normal_geometry 提供吸附前值。
fn save_normal_geometry(app: &AppHandle) {
    let Some(window) = app.get_webview_window(DANMAKU_WINDOW_LABEL) else {
        return;
    };
    let state = app.state::<AppState>();
    // 表情面板展开中的几何是临时形态，不落盘
    if state
        .danmaku_emote_panel
        .load(Ordering::Relaxed)
    {
        return;
    }
    let input_only = state
        .danmaku_input_only
        .load(Ordering::Relaxed);
    let Some((pos, physical)) = window_dock::normal_geometry(&window, app) else {
        return;
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    let width = (physical.width as f64 / scale).round();
    let height = (physical.height as f64 / scale).round();

    let state = app.state::<AppState>();
    // 读旧记录，保留另一模式的尺寸字段
    let mut saved = selections_store::load_values(state.inner(), &[GEOMETRY_KEY.to_string()])
        .ok()
        .and_then(|values| values.get(GEOMETRY_KEY).cloned())
        .and_then(|value| serde_json::from_value::<SavedGeometry>(value).ok())
        .unwrap_or(SavedGeometry {
            position: None,
            width: None,
            height: None,
            input_only: false,
            input_only_width: None,
        });

    if input_only {
        // 紧凑模式：只更新位置与紧凑宽（高度锁定无需存）
        if !(INPUT_ONLY_MIN_W..=INPUT_ONLY_MAX_W).contains(&width) {
            return;
        }
        saved.position = Some((pos.x, pos.y));
        saved.input_only_width = Some(width);
        saved.input_only = true;
    } else {
        // 约束外的尺寸视为异常几何，不落盘污染下次恢复
        if !size_in_constraints(width, height) {
            return;
        }
        saved.position = Some((pos.x, pos.y));
        saved.width = Some(width);
        saved.height = Some(height);
        saved.input_only = false;
    }

    let mut entries = serde_json::Map::new();
    entries.insert(
        GEOMETRY_KEY.to_string(),
        serde_json::to_value(saved).unwrap_or_default(),
    );
    if let Err(e) = selections_store::save_values(state.inner(), &entries) {
        log::warn!("保存弹幕窗口几何失败: {e}");
    }
}
