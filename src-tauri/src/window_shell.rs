//! 主窗口材质与直播、视频弹幕小窗共用的原生窗口配置。
//!
//! 两个小窗是同一「弹幕小窗」的两种内容形态，窗口壳（无边框、透明、置顶、
//! 不进任务栏、可缩放、WebView2 后台节流开关）必须完全一致；尺寸、位置、
//! 吸附与输入框等策略由各自建窗函数处理。

use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "windows")]
pub fn apply_main_window_backdrop(window: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMSBT_TRANSIENTWINDOW, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE,
        DWMWA_SYSTEMBACKDROP_TYPE, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
    };

    let Ok(hwnd) = window.hwnd() else { return };
    let hwnd = HWND(hwnd.0);
    let corners = DWMWCP_ROUND;
    let material = DWMSBT_TRANSIENTWINDOW;
    // Acrylic 在 WebView 后面，由 DWM 合成；需要让 DWM 裁掉同一块背景的四角。
    let result = unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            std::ptr::from_ref(&corners).cast(),
            std::mem::size_of_val(&corners) as u32,
        )
        .and_then(|()| {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_SYSTEMBACKDROP_TYPE,
                std::ptr::from_ref(&material).cast(),
                std::mem::size_of_val(&material) as u32,
            )
        })
    };
    if let Err(error) = result {
        log::debug!("主窗口系统背景模糊不可用：{error}");
        return;
    }

    // 无边框窗口保留一圈系统非客户区，让 DWM 的背景和外轮廓使用同一套圆角。
    let _ = window.set_shadow(true);
    let border = DWMWA_COLOR_NONE;
    let _ = unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            std::ptr::from_ref(&border).cast(),
            std::mem::size_of_val(&border) as u32,
        )
    };
}

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
