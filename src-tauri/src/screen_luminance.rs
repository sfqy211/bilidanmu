//! 屏幕背景亮度采样：周期性截取弹幕窗口所在区域，算平均亮度，
//! 供「跟随背景亮暗自动切换」使用。
//!
//! 用 GDI BitBlt 截屏 + 稀疏采样（每 N 像素取一点）。
//!
//! 性能要点（实测）：单次调用的开销主要来自 GDI 上下文创建与 BitBlt，
//! **与区域大小几乎无关**（16×200 与 42×600 都是约 7ms）。
//! 因此多截几块区域不如一次截大矩形再在像素里挑选，后者能省掉多次上下文创建。

#[cfg(target_os = "windows")]
mod imp {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT,
        DIB_RGB_COLORS, HGDIOBJ, SRCCOPY,
    };

    /// 采样区域内每 SAMPLE_STEP 像素取一个点，采样点太多没有意义且拖慢速度
    const SAMPLE_STEP: i32 = 8;

    /// 截取屏幕一块矩形，返回 BGRA 像素（自上而下排列，每像素 4 字节）。
    /// 区域无效或截图失败返回 None。
    pub fn grab_region(x: i32, y: i32, width: i32, height: i32) -> Option<Vec<u8>> {
        if width <= 0 || height <= 0 {
            return None;
        }

        unsafe {
            let screen_dc = GetDC(HWND::default());
            if screen_dc.is_invalid() {
                return None;
            }
            let mem_dc = CreateCompatibleDC(screen_dc);
            let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
            if bitmap.is_invalid() {
                let _ = ReleaseDC(HWND::default(), screen_dc);
                let _ = DeleteDC(mem_dc);
                return None;
            }
            let old = SelectObject(mem_dc, HGDIOBJ(bitmap.0));

            // CAPTUREBLT 让分层窗口也进入截图
            let copied = BitBlt(mem_dc, 0, 0, width, height, screen_dc, x, y, SRCCOPY | CAPTUREBLT);

            let mut result = None;
            if copied.is_ok() {
                let mut info = BITMAPINFO {
                    bmiHeader: BITMAPINFOHEADER {
                        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                        biWidth: width,
                        // 负高度 = 自上而下，省一次翻转
                        biHeight: -height,
                        biPlanes: 1,
                        biBitCount: 32,
                        biCompression: BI_RGB.0,
                        ..Default::default()
                    },
                    ..Default::default()
                };
                let mut buffer = vec![0u8; (width as usize) * (height as usize) * 4];
                let lines = GetDIBits(
                    mem_dc,
                    bitmap,
                    0,
                    height as u32,
                    Some(buffer.as_mut_ptr() as *mut _),
                    &mut info,
                    DIB_RGB_COLORS,
                );
                if lines > 0 {
                    result = Some(buffer);
                }
            }

            SelectObject(mem_dc, old);
            let _ = DeleteObject(HGDIOBJ(bitmap.0));
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(HWND::default(), screen_dc);
            result
        }
    }

    /// 从已截取的像素里算平均亮度，跳过 (skip_x, skip_y, skip_w, skip_h) 这块区域
    /// （用于排除弹幕窗自身覆盖的部分）。采样点全被排除时返回 None。
    ///
    /// 像素格式 BGRA，用感知亮度 0.299R + 0.587G + 0.114B，比简单平均更贴近人眼观感。
    pub fn average_luminance_excluding(
        pixels: &[u8],
        width: i32,
        height: i32,
        skip_x: i32,
        skip_y: i32,
        skip_w: i32,
        skip_h: i32,
    ) -> Option<f32> {
        if width <= 0 || height <= 0 || pixels.len() < (width as usize) * (height as usize) * 4 {
            return None;
        }
        let (skip_right, skip_bottom) = (skip_x + skip_w, skip_y + skip_h);

        let mut sum = 0f64;
        let mut count = 0u32;
        let mut y = 0;
        while y < height {
            let in_skip_y = skip_w > 0 && skip_h > 0 && y >= skip_y && y < skip_bottom;
            let mut x = 0;
            while x < width {
                // 落在窗口自身区域内则跳过
                if !(in_skip_y && x >= skip_x && x < skip_right) {
                    let index = ((y * width + x) * 4) as usize;
                    let b = pixels[index] as f64;
                    let g = pixels[index + 1] as f64;
                    let r = pixels[index + 2] as f64;
                    sum += 0.299 * r + 0.587 * g + 0.114 * b;
                    count += 1;
                }
                x += SAMPLE_STEP;
            }
            y += SAMPLE_STEP;
        }
        if count == 0 {
            return None;
        }
        Some((sum / count as f64 / 255.0) as f32)
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    pub fn grab_region(_x: i32, _y: i32, _width: i32, _height: i32) -> Option<Vec<u8>> {
        None
    }
    pub fn average_luminance_excluding(
        _pixels: &[u8],
        _width: i32,
        _height: i32,
        _skip_x: i32,
        _skip_y: i32,
        _skip_w: i32,
        _skip_h: i32,
    ) -> Option<f32> {
        None
    }
}

pub use imp::{average_luminance_excluding, grab_region};
