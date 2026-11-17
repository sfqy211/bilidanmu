//! 弹幕小窗的窗口壳：直播弹幕窗与视频弹幕窗共用的原生窗口配置。
//!
//! 两个小窗是同一「弹幕小窗」的两种内容形态，窗口壳（无边框、透明、置顶、
//! 不进任务栏、可缩放、WebView2 后台节流开关）必须完全一致；尺寸、位置、
//! 吸附与输入框等策略由各自建窗函数处理。

use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

/// 创建统一配置的弹幕小窗 builder。
///
/// 调用方在返回的 builder 上继续追加窗口尺寸/约束后 `build()`。
pub fn build_shell_window<'a>(
    app: &'a AppHandle,
    label: &str,
    url: WebviewUrl,
    title: &str,
) -> tauri::Result<WebviewWindowBuilder<'a, tauri::Wry, AppHandle>> {
    let builder = WebviewWindowBuilder::new(app, label, url)
        .title(title)
        .resizable(true)
        .maximizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .shadow(false)
        // 弹幕小窗全程不进任务栏（对齐 QQ：看直播/吸附时任务栏不留图标）。
        // 系统托盘图标保留，仍可通过托盘或小窗的退出按钮切回主页面。
        .skip_taskbar(true);
    // 隐藏到托盘/吸附折叠时 WebView2 会节流后台定时器（Chromium 对隐藏页面
    // 5 分钟后可低至 1 次/分钟），mpegts.js 拉流循环与吸附/透传轮询都依赖 JS
    // 定时器。additional_browser_args 是整体替换而非追加，必须保留 Tauri
    // 默认禁用的 msWebOOUI 等特性。
    #[cfg(target_os = "windows")]
    let builder = builder.additional_browser_args(concat!(
        "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,IntensiveWakeUpThrottling",
        " --disable-background-timer-throttling",
        " --disable-backgrounding-occluded-windows",
        " --disable-renderer-backgrounding",
    ));
    Ok(builder)
}
