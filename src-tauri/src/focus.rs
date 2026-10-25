//! 前台焦点管理（借鉴 live-moyu 的 capture/restore，直接用 windows crate，无需助手进程）。
//!
//! 唤起本应用窗口前记录当前前台窗口；隐藏时若前台仍是本应用窗口，
//! 把焦点还给记录的窗口——快捷键唤起→隐藏后回到原来的工作应用。

#[cfg(target_os = "windows")]
mod imp {
    use std::sync::Mutex as StdMutex;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow,
    };

    /// 上次唤起时的前台窗口句柄
    static PREVIOUS: StdMutex<Option<isize>> = StdMutex::new(None);

    pub fn capture() {
        let foreground = unsafe { GetForegroundWindow() };
        if foreground.0.is_null() {
            return;
        }
        let mut pid = 0u32;
        unsafe {
            GetWindowThreadProcessId(foreground, Some(&mut pid));
        }
        *PREVIOUS.lock().unwrap_or_else(|e| e.into_inner()) = Some(foreground.0 as isize);
    }

    /// 还原前台窗口：仅当当前前台仍是 expected（本应用自己的窗口）时才切换，
    /// 用户已手动切到别处时不抢焦点。
    pub fn restore(expected_hwnd: isize) {
        let previous = *PREVIOUS.lock().unwrap_or_else(|e| e.into_inner());
        let Some(hwnd) = previous else { return };
        let current = unsafe { GetForegroundWindow() };
        if current.0 as isize != expected_hwnd {
            return;
        }
        unsafe {
            let _ = SetForegroundWindow(HWND(hwnd as *mut _));
        }
        *PREVIOUS.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    pub fn capture() {}
    pub fn restore(_expected_hwnd: isize) {}
}

pub use imp::{capture, restore};
