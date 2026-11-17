//! 运行时给托盘 / 窗口图标着色。
//!
//! 应用图标本身是「纯色 D 形 + 透明底」，所以不需要 SVG 渲染：
//! 读入打包好的 PNG，按 alpha 保留轮廓、把 RGB 替换成当前强调色即可。
//! 强调色由前端在主题应用后通过 `set_brand_accent` 推过来。

use tauri::{image::Image, AppHandle, Manager};

/// 托盘尺寸（Windows 16/32px 场景足够）
const TRAY_ICON_PNG: &[u8] = include_bytes!("../icons/32x32.png");
/// 窗口 / 任务栏用更大一档，缩放后边缘更干净
const WINDOW_ICON_PNG: &[u8] = include_bytes!("../icons/128x128.png");

/// 解析强调色：支持 `#RRGGBB`、`#RGB` 与 `"r g b"` 三元组。
pub fn parse_accent(value: &str) -> Option<(u8, u8, u8)> {
    let value = value.trim();
    if let Some(hex) = value.strip_prefix('#') {
        let expanded = if hex.len() == 3 {
            hex.chars()
                .flat_map(|ch| [ch, ch])
                .collect::<String>()
        } else {
            hex.to_string()
        };
        if expanded.len() != 6 || !expanded.chars().all(|ch| ch.is_ascii_hexdigit()) {
            return None;
        }
        let num = u32::from_str_radix(&expanded, 16).ok()?;
        return Some((
            ((num >> 16) & 0xFF) as u8,
            ((num >> 8) & 0xFF) as u8,
            (num & 0xFF) as u8,
        ));
    }

    let parts: Vec<&str> = value.split_whitespace().collect();
    if parts.len() != 3 {
        return None;
    }
    let mut channels = [0u8; 3];
    for (index, part) in parts.iter().enumerate() {
        channels[index] = part.parse::<u8>().ok()?;
    }
    Some((channels[0], channels[1], channels[2]))
}

/// 保留 alpha、替换 RGB。
fn tint(png: &[u8], rgb: (u8, u8, u8)) -> Result<Image<'static>, String> {
    let source = Image::from_bytes(png).map_err(|error| format!("解码图标失败: {error}"))?;
    let width = source.width();
    let height = source.height();
    let mut rgba = source.rgba().to_vec();
    for pixel in rgba.chunks_exact_mut(4) {
        if pixel[3] > 0 {
            pixel[0] = rgb.0;
            pixel[1] = rgb.1;
            pixel[2] = rgb.2;
        }
    }
    Ok(Image::new_owned(rgba, width, height))
}

/// 前端在主题应用后调用：把当前强调色同步给托盘 / 窗口图标。
#[tauri::command]
pub fn set_brand_accent(
    app: AppHandle,
    state: tauri::State<'_, crate::AppState>,
    accent: String,
) -> Result<(), String> {
    let Some(rgb) = parse_accent(&accent) else {
        return Err(format!("无法解析强调色: {accent}"));
    };
    if let Ok(mut guard) = state.brand_accent.lock() {
        *guard = Some(rgb);
    }
    log::info!("[brand] 托盘/窗口图标已着色 accent={accent}");
    apply(&app, rgb)
}

/// 新建的弹幕窗 / 视频窗没有走主题应用流程：建窗后补一次当前强调色。
pub fn apply_to_window(app: &AppHandle, window: &tauri::WebviewWindow) {
    let rgb = app
        .try_state::<crate::AppState>()
        .and_then(|state| state.brand_accent.lock().ok().and_then(|guard| *guard));
    let Some(rgb) = rgb else {
        return;
    };
    if let Ok(icon) = tint(WINDOW_ICON_PNG, rgb) {
        if let Err(error) = window.set_icon(icon) {
            log::warn!("[brand] 新窗口图标着色失败: {error}");
        }
    }
}

/// 把强调色应用到托盘和所有窗口图标。
///
/// 失败只返回错误给调用方记录日志，不影响主题本身的切换。
pub fn apply(app: &AppHandle, rgb: (u8, u8, u8)) -> Result<(), String> {
    if let Some(tray) = app.try_state::<tauri::tray::TrayIcon>() {
        let icon = tint(TRAY_ICON_PNG, rgb)?;
        tray.set_icon(Some(icon))
            .map_err(|error| format!("更新托盘图标失败: {error}"))?;
    }

    let window_icon = tint(WINDOW_ICON_PNG, rgb)?;
    for (_, window) in app.webview_windows() {
        if let Err(error) = window.set_icon(window_icon.clone()) {
            log::warn!("[brand] 更新窗口图标失败: {error}");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::parse_accent;

    #[test]
    fn tint_keeps_alpha_and_replaces_rgb() {
        let icon = super::tint(super::TRAY_ICON_PNG, (1, 2, 3)).expect("tint");
        let rgba = icon.rgba();
        assert_eq!(icon.width(), 32);
        assert_eq!(icon.height(), 32);
        let visible = rgba
            .chunks_exact(4)
            .find(|pixel| pixel[3] > 0)
            .expect("visible pixel");
        assert_eq!(&visible[0..3], &[1, 2, 3]);
        assert!(rgba.chunks_exact(4).any(|pixel| pixel[3] == 0));
    }

    #[test]
    fn parses_hex_and_triplets() {
        assert_eq!(parse_accent("#2DD4BF"), Some((45, 212, 191)));
        assert_eq!(parse_accent("#0af"), Some((0, 170, 255)));
        assert_eq!(parse_accent("45 212 191"), Some((45, 212, 191)));
        assert_eq!(parse_accent(" 34D399 "), None);
        assert_eq!(parse_accent("#12345"), None);
        assert_eq!(parse_accent("1 2"), None);
    }
}
