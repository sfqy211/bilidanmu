//! 全局快捷键：注册、变更重注册与动作分发。
//!
//! 绑定持久化在 settings.shortcuts；启动与每次设置保存后调用 apply_shortcuts
//! 全量重注册（幂等，注销后按新设置注册）。音频类动作的播放器状态在弹幕窗
//! webview 内，经事件转发给前端执行。

use crate::{commands, settings_store, tray, AppState};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

/// 查询最近一次全局快捷键注册的失败清单（设置页展示）
#[tauri::command]
pub fn get_shortcut_errors(state: State<'_, AppState>) -> Vec<String> {
    state
        .shortcut_errors
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

/// 按当前设置重注册全部全局快捷键（启动与设置保存后调用）
pub fn apply_shortcuts(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Ok(settings) = settings_store::load_settings(state.inner()) else {
        return;
    };
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let mut errors: Vec<String> = Vec::new();
    let shortcuts = &settings.shortcuts;
    let bindings = [
        ("显示/隐藏应用窗口", shortcuts.toggle_window.as_deref()),
        ("仅输入框模式", shortcuts.toggle_input_only.as_deref()),
        ("音频播放/暂停", shortcuts.toggle_audio.as_deref()),
        ("音频静音", shortcuts.toggle_mute.as_deref()),
    ];
    for (name, binding) in bindings {
        let Some(binding) = binding else { continue };
        match binding.parse::<Shortcut>() {
            Ok(shortcut) => {
                if let Err(e) = gs.register(shortcut) {
                    log::warn!("注册全局快捷键失败 [{name}] {binding}: {e}");
                    errors.push(format!("「{name}」{binding} 注册失败（可能被其它程序占用）"));
                }
            }
            Err(_) => {
                log::warn!("全局快捷键格式无法解析，已忽略 [{name}] {binding}");
                errors.push(format!("「{name}」{binding} 格式无法解析"));
            }
        }
    }
    *state
        .shortcut_errors
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = errors;
}

/// 触发的快捷键 → 动作分发（global-shortcut 插件 handler 调用，仅响应按下）
pub fn handle_shortcut(app: &AppHandle, shortcut: &Shortcut) {
    let state = app.state::<AppState>();
    let Ok(settings) = settings_store::load_settings(state.inner()) else {
        return;
    };
    let shortcuts = &settings.shortcuts;
    let bindings = [
        ("toggleWindow", shortcuts.toggle_window.as_deref()),
        ("toggleInputOnly", shortcuts.toggle_input_only.as_deref()),
        ("toggleAudio", shortcuts.toggle_audio.as_deref()),
        ("toggleMute", shortcuts.toggle_mute.as_deref()),
    ];
    for (action, binding) in bindings {
        if binding
            .and_then(|b| b.parse::<Shortcut>().ok())
            .is_some_and(|s| &s == shortcut)
        {
            dispatch(app, action);
            return;
        }
    }
}

fn dispatch(app: &AppHandle, action: &str) {
    match action {
        // 与托盘左键同语义：当前窗口（连接房间时弹幕窗，否则主窗）显示/隐藏
        "toggleWindow" => tray::toggle_current_window(app),
        // 复用仅输入框模式切换（无弹幕窗时忽略）
        "toggleInputOnly" => {
            if app
                .get_webview_window(commands::room::DANMAKU_WINDOW_LABEL)
                .is_some()
            {
                let state = app.state::<AppState>();
                let enabled = !state
                    .danmaku_input_only
                    .load(std::sync::atomic::Ordering::Relaxed);
                if let Err(e) = commands::room::apply_input_only(app, state.inner(), enabled) {
                    log::warn!("全局快捷键切换仅输入框模式失败: {e}");
                }
            }
        }
        // 播放器状态在弹幕窗 webview 内，经事件转发由前端执行
        "toggleAudio" | "toggleMute" => {
            let _ = app.emit("global-shortcut-action", action);
        }
        _ => {}
    }
}
