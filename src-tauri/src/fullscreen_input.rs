use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use tauri::{WebviewWindow, Window, WindowEvent};

const OVERLAY_LABEL: &str = "danmaku-input-overlay";

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct InputRect {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

#[derive(Deserialize, Serialize)]
struct InputSubmit {
    rect: InputRect,
    label: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FullscreenInputRequest {
    rect: InputRect,
    text: String,
    max_length: usize,
    multiline: bool,
    label: String,
    placeholder: Option<String>,
    style: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    submit: Option<InputSubmit>,
}

#[derive(Deserialize, Serialize)]
pub(crate) struct FullscreenInputResult {
    text: String,
    send: bool,
}

fn is_source(label: &str) -> bool {
    label == crate::commands::room::DANMAKU_WINDOW_LABEL
        || label == crate::commands::video_window::LABEL
}

#[tauri::command]
pub(crate) async fn begin_fullscreen_input(
    window: WebviewWindow,
    request: FullscreenInputRequest,
) -> Result<Option<FullscreenInputResult>, String> {
    if !is_source(window.label()) {
        return Err("Fullscreen input is only available from a danmaku window".into());
    }
    #[cfg(windows)]
    return native::begin(window, request).await;
    #[cfg(not(windows))]
    {
        let _ = request;
        Ok(None)
    }
}

#[tauri::command]
pub(crate) async fn ready_fullscreen_input(
    window: WebviewWindow,
    id: String,
) -> Result<bool, String> {
    if window.label() != OVERLAY_LABEL {
        return Err("Invalid fullscreen input window".into());
    }
    #[cfg(windows)]
    return native::ready(window, id).await;
    #[cfg(not(windows))]
    {
        let _ = id;
        Ok(false)
    }
}

#[tauri::command]
pub(crate) async fn finish_fullscreen_input(
    window: WebviewWindow,
    id: String,
    result: FullscreenInputResult,
) -> Result<(), String> {
    if window.label() != OVERLAY_LABEL {
        return Err("Invalid fullscreen input window".into());
    }
    #[cfg(windows)]
    return native::finish(window, id, result).await;
    #[cfg(not(windows))]
    {
        let _ = (id, result);
        Ok(())
    }
}

#[tauri::command]
pub(crate) async fn cancel_fullscreen_input(window: WebviewWindow) -> Result<(), String> {
    if !is_source(window.label()) {
        return Err("Invalid fullscreen input source".into());
    }
    #[cfg(windows)]
    return native::cancel(window).await;
    #[cfg(not(windows))]
    Ok(())
}

pub(crate) fn on_window_event(window: &Window, event: &WindowEvent) {
    #[cfg(windows)]
    native::on_window_event(window, event);
    #[cfg(not(windows))]
    let _ = (window, event);
}

#[cfg(windows)]
mod native {
    use super::*;
    use std::sync::Mutex;
    use std::time::{Duration, Instant};
    use tauri::{AppHandle, Manager, WebviewUrl};
    use tokio::sync::oneshot;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
    use windows::Win32::Graphics::Gdi::{
        ClientToScreen, CombineRgn, CreateRectRgn, DeleteObject, GetMonitorInfoW,
        MonitorFromWindow, SetWindowRgn, MONITORINFO, MONITOR_DEFAULTTONULL, RGN_ERROR, RGN_OR,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
    use windows::Win32::UI::Shell::{ITaskbarList2, TaskbarList};
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetAncestor, GetClassNameW, GetClientRect, GetForegroundWindow,
        GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible,
        SetForegroundWindow, SetWindowPos, SetWindowsHookExW, ShowWindow, UnhookWindowsHookEx,
        WindowFromPoint, GA_ROOT, HC_ACTION, HHOOK, HWND_TOPMOST, MSLLHOOKSTRUCT, SWP_NOACTIVATE,
        SW_HIDE, SW_SHOWNOACTIVATE, WH_MOUSE_LL, WM_LBUTTONDOWN, WM_MBUTTONDOWN, WM_RBUTTONDOWN,
        WM_XBUTTONDOWN,
    };

    const STARTUP_LIMIT: Duration = Duration::from_secs(5);
    const WATCH_INTERVAL: Duration = Duration::from_millis(100);
    const BLUR_GRACE: Duration = Duration::from_millis(150);
    const FULLSCREEN_HANDOFF_GRACE: Duration = Duration::from_millis(48);

    struct MouseHandoffHook(isize);

    impl Drop for MouseHandoffHook {
        fn drop(&mut self) {
            let _ = unsafe { UnhookWindowsHookEx(HHOOK(self.0 as *mut _)) };
        }
    }

    unsafe extern "system" fn handoff_on_source_click(
        code: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if code == HC_ACTION as i32
            && matches!(
                wparam.0 as u32,
                WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN | WM_XBUTTONDOWN
            )
        {
            let foreground = GetForegroundWindow().0 as isize;
            let target = state()
                .session
                .as_ref()
                .and_then(|session| (session.host == Some(foreground)).then_some(session.target));
            if let Some(target) = target {
                let point = (*(lparam.0 as *const MSLLHOOKSTRUCT)).pt;
                let hit = GetAncestor(WindowFromPoint(point), GA_ROOT);
                let original = as_hwnd(target.foreground);
                if hit == as_hwnd(target.source)
                    && usable(original)
                    && process_id(original) == target.foreground_pid
                {
                    // 先把前台还给外部全屏应用，再让 Windows 正常派发这次鼠标按下。
                    // 否则同一输入线程的 WebView2 会在 DOM 收到事件前激活原弹幕窗。
                    let _ = SetForegroundWindow(original);
                }
            }
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    #[derive(Clone, Copy)]
    struct Target {
        source: isize,
        source_bounds: RECT,
        foreground: isize,
        foreground_pid: u32,
        monitor: RECT,
        input: InputRect,
        submit: Option<InputRect>,
    }

    struct Session {
        id: String,
        source_label: String,
        target: Target,
        draft: String,
        max_length: usize,
        host: Option<isize>,
        mouse_handoff: Option<MouseHandoffHook>,
        completion: oneshot::Sender<Option<FullscreenInputResult>>,
    }

    enum Completion {
        Fallback,
        Cancelled,
        Finished(FullscreenInputResult),
    }

    #[derive(Default)]
    struct OverlayState {
        building: bool,
        session: Option<Session>,
    }

    static OVERLAY: Mutex<OverlayState> = Mutex::new(OverlayState {
        building: false,
        session: None,
    });

    fn mock_diagnostic(detail: std::fmt::Arguments<'_>) {
        if crate::bili::mock::is_enabled() {
            log::info!("[mock] 全屏输入 {detail}");
        }
    }

    fn state() -> std::sync::MutexGuard<'static, OverlayState> {
        OVERLAY.lock().unwrap_or_else(|error| error.into_inner())
    }

    fn as_hwnd(handle: isize) -> HWND {
        HWND(handle as *mut _)
    }

    fn process_id(hwnd: HWND) -> u32 {
        let mut id = 0;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut id)) };
        id
    }

    fn contains(outer: RECT, inner: RECT) -> bool {
        outer.left <= inner.left
            && outer.top <= inner.top
            && outer.right >= inner.right
            && outer.bottom >= inner.bottom
    }

    fn client_bounds(hwnd: HWND) -> Option<RECT> {
        let mut origin = POINT::default();
        let mut client = RECT::default();
        unsafe {
            GetClientRect(hwnd, &mut client).ok()?;
            ClientToScreen(hwnd, &mut origin).ok().ok()?;
        }
        Some(RECT {
            left: origin.x,
            top: origin.y,
            right: origin.x.checked_add(client.right)?,
            bottom: origin.y.checked_add(client.bottom)?,
        })
    }

    fn usable(hwnd: HWND) -> bool {
        unsafe {
            !hwnd.0.is_null()
                && IsWindow(hwnd).as_bool()
                && IsWindowVisible(hwnd).as_bool()
                && !IsIconic(hwnd).as_bool()
        }
    }

    impl Target {
        fn covers_fullscreen_area(self, client: RECT) -> bool {
            // Chrome 失焦后可能留出 1 个物理像素。仍以首次覆盖整个显示器为准。
            let monitor = self.monitor;
            contains(
                client,
                RECT {
                    left: monitor.left + 1,
                    top: monitor.top + 1,
                    right: monitor.right - 1,
                    bottom: monitor.bottom - 1,
                },
            )
        }

        fn remains_fullscreen(self) -> bool {
            let source = as_hwnd(self.source);
            let foreground = as_hwnd(self.foreground);
            usable(source)
                && client_bounds(source) == Some(self.source_bounds)
                && usable(foreground)
                && process_id(foreground) == self.foreground_pid
                && client_bounds(foreground)
                    .is_some_and(|client| self.covers_fullscreen_area(client))
        }

        fn foreground_unchanged(self) -> bool {
            unsafe { GetForegroundWindow() == as_hwnd(self.foreground) }
        }
    }

    fn find_target(
        source: &WebviewWindow,
        editor: InputRect,
        submit: Option<InputRect>,
    ) -> Result<Target, &'static str> {
        let hwnd = HWND(source.hwnd().map_err(|_| "source_handle_unavailable")?.0);
        let foreground = unsafe { GetForegroundWindow() };
        let foreground_pid = process_id(foreground);
        if !usable(hwnd) {
            return Err("source_not_visible");
        }
        if hwnd == foreground {
            return Err("foreground_is_source");
        }
        if foreground_pid == std::process::id() {
            return Err("foreground_is_other_app_window");
        }
        if !usable(foreground) || foreground_pid == 0 {
            return Err("foreground_unavailable");
        }
        mock_diagnostic(format_args!("前台窗口属于其他进程"));

        let mut display = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        unsafe {
            let monitor = MonitorFromWindow(foreground, MONITOR_DEFAULTTONULL);
            GetMonitorInfoW(monitor, &mut display)
                .ok()
                .map_err(|_| "foreground_monitor_unavailable")?;
        }
        let monitor = display.rcMonitor;
        if !client_bounds(foreground).is_some_and(|client| contains(client, monitor)) {
            return Err("foreign_client_does_not_cover_monitor");
        }
        let client = client_bounds(hwnd).ok_or("source_client_bounds_unavailable")?;
        let input = monitor_position(editor, client, monitor)?;
        let submit = submit
            .map(|rect| {
                monitor_position(rect, client, monitor)
                    .map_err(|_| "submit_outside_source_or_monitor")
            })
            .transpose()?;
        Ok(Target {
            source: hwnd.0 as isize,
            source_bounds: client,
            foreground: foreground.0 as isize,
            foreground_pid,
            monitor,
            input,
            submit,
        })
    }

    fn monitor_position(
        rect: InputRect,
        client: RECT,
        monitor: RECT,
    ) -> Result<InputRect, &'static str> {
        let x = client.left.checked_add(rect.x).ok_or("input_x_overflow")?;
        let y = client.top.checked_add(rect.y).ok_or("input_y_overflow")?;
        let on_screen = RECT {
            left: x,
            top: y,
            right: x.checked_add(rect.width).ok_or("input_width_overflow")?,
            bottom: y.checked_add(rect.height).ok_or("input_height_overflow")?,
        };
        if !contains(client, on_screen) {
            return Err("input_outside_source_client");
        }
        if !contains(monitor, on_screen) {
            return Err("input_outside_foreground_monitor");
        }

        Ok(InputRect {
            x: x.checked_sub(monitor.left).ok_or("monitor_x_overflow")?,
            y: y.checked_sub(monitor.top).ok_or("monitor_y_overflow")?,
            ..rect
        })
    }

    fn unavailable(target: Target) -> Completion {
        if target.foreground_unchanged() && target.remains_fullscreen() {
            Completion::Fallback
        } else {
            Completion::Cancelled
        }
    }

    fn valid_request(request: &FullscreenInputRequest) -> bool {
        valid_rect(request.rect)
            && request
                .submit
                .as_ref()
                .is_none_or(|submit| valid_rect(submit.rect) && submit.label.len() <= 512)
            && (1..=512).contains(&request.max_length)
            && request.text.len() <= 4096
            && request.label.len() <= 512
            && request
                .placeholder
                .as_ref()
                .is_none_or(|text| text.len() <= 512)
            && request.style.iter().all(|(name, value)| {
                value.len() <= 512
                    && matches!(
                        name.as_str(),
                        "fontFamily"
                            | "fontSize"
                            | "fontWeight"
                            | "fontStyle"
                            | "lineHeight"
                            | "letterSpacing"
                            | "color"
                            | "caretColor"
                            | "backgroundColor"
                            | "border"
                            | "borderRadius"
                            | "boxShadow"
                            | "padding"
                            | "textAlign"
                            | "direction"
                            | "whiteSpace"
                            | "overflowWrap"
                            | "zoom"
                            | "placeholderColor"
                    )
            })
    }

    fn valid_rect(rect: InputRect) -> bool {
        rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0
    }

    async fn on_main<T: Send + 'static>(
        app: &AppHandle,
        action: impl FnOnce() -> T + Send + 'static,
    ) -> Result<T, String> {
        let (tx, rx) = oneshot::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(action());
        })
        .map_err(|error| error.to_string())?;
        rx.await.map_err(|error| error.to_string())
    }

    pub(super) async fn begin(
        window: WebviewWindow,
        request: FullscreenInputRequest,
    ) -> Result<Option<FullscreenInputResult>, String> {
        mock_diagnostic(format_args!("begin source={}", window.label()));
        if !valid_request(&request) {
            mock_diagnostic(format_args!("begin fallback=invalid_request"));
            return Ok(None);
        }
        let app = window.app_handle().clone();
        let source_label = window.label().to_owned();
        let rect = request.rect;
        let submit = request.submit.as_ref().map(|submit| submit.rect);
        let target = match on_main(&app, move || find_target(&window, rect, submit)).await? {
            Ok(target) => target,
            Err(reason) => {
                mock_diagnostic(format_args!("begin fallback={reason}"));
                return Ok(None);
            }
        };
        mock_diagnostic(format_args!("begin accepted fullscreen target"));

        let id = uuid::Uuid::new_v4().to_string();
        let mut data = serde_json::json!({
            "id": &id,
            "input": &request,
            "position": target.input,
        });
        if let Some(submit) = target.submit {
            data["submitPosition"] = serde_json::json!(submit);
        }
        let script = format!("window.__BILIDANMU_FULLSCREEN_INPUT__ = {data};");
        let (completion, result) = oneshot::channel();
        {
            let mut state = state();
            if state.building
                || state.session.is_some()
                || app.get_webview_window(OVERLAY_LABEL).is_some()
            {
                mock_diagnostic(format_args!("begin fallback=host_busy"));
                return Ok(None);
            }
            state.building = true;
            state.session = Some(Session {
                id: id.clone(),
                source_label,
                target,
                draft: request.text,
                max_length: request.max_length,
                host: None,
                mouse_handoff: None,
                completion,
            });
        }

        // 同一 WebView2 用户数据目录中的窗口须使用相同的浏览器启动参数。
        let host = crate::window_shell::build_shell_window(
            &app,
            OVERLAY_LABEL,
            WebviewUrl::App("danmaku-input-overlay".into()),
            "BiliDanmu",
        )
        .and_then(|builder| {
            builder
                .initialization_script(script)
                .visible(false)
                .focused(false)
                .resizable(false)
                .build()
        });
        let current = {
            let mut state = state();
            state.building = false;
            state
                .session
                .as_ref()
                .is_some_and(|session| session.id == id)
        };
        match host {
            Ok(host) if !current => {
                let _ = host.destroy();
            }
            Ok(_) => {
                mock_diagnostic(format_args!("begin host_created"));
                tauri::async_runtime::spawn(watch_session(app, id));
            }
            Err(error) => {
                log::debug!("全屏输入窗创建失败：{error}");
                mock_diagnostic(format_args!("begin host_create_failed={error}"));
                if current {
                    let app_for_close = app.clone();
                    on_main(&app, move || {
                        complete(&app_for_close, &id, unavailable(target), false)
                    })
                    .await?;
                }
            }
        }

        Ok(result.await.unwrap_or(None))
    }

    fn activate(
        window: &WebviewWindow,
        target: Target,
    ) -> Result<(isize, MouseHandoffHook), String> {
        let hwnd = HWND(window.hwnd().map_err(|error| error.to_string())?.0);
        let monitor = target.monitor;
        if !target.foreground_unchanged() || !target.remains_fullscreen() {
            return Err("Fullscreen target changed before activation".into());
        }
        unsafe {
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                monitor.left,
                monitor.top,
                monitor.right - monitor.left,
                monitor.bottom - monitor.top,
                SWP_NOACTIVATE,
            )
            .map_err(|error| error.to_string())?;
        }
        if client_bounds(hwnd) != Some(monitor) {
            return Err("Fullscreen input client area does not cover its monitor".into());
        }
        let mut outer = RECT::default();
        unsafe { GetWindowRect(hwnd, &mut outer) }.map_err(|error| error.to_string())?;
        let window_x = monitor.left - outer.left;
        let window_y = monitor.top - outer.top;
        let editor = target.input;
        unsafe {
            let editor_x = window_x + editor.x;
            let editor_y = window_y + editor.y;
            let region = CreateRectRgn(
                editor_x,
                editor_y,
                editor_x + editor.width,
                editor_y + editor.height,
            );
            if region.0.is_null() {
                return Err("Could not create an input window region".into());
            }
            if let Some(submit) = target.submit {
                let submit_x = window_x + submit.x;
                let submit_y = window_y + submit.y;
                let submit_region = CreateRectRgn(
                    submit_x,
                    submit_y,
                    submit_x + submit.width,
                    submit_y + submit.height,
                );
                if submit_region.0.is_null() {
                    let _ = DeleteObject(region);
                    return Err("Could not create a submit button region".into());
                }
                let combined = CombineRgn(region, region, submit_region, RGN_OR);
                let _ = DeleteObject(submit_region);
                if combined == RGN_ERROR {
                    let _ = DeleteObject(region);
                    return Err("Could not combine the input and submit button regions".into());
                }
            }
            if SetWindowRgn(hwnd, region, true) == 0 {
                let _ = DeleteObject(region);
                return Err("Could not clip the fullscreen input window".into());
            }
        }

        unsafe {
            // Tao 后续的 show() 会走 SW_SHOW。这一步必须保证先显示、再标记全屏，
            // 最后才把焦点从原全屏应用交给输入窗。
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            if !IsWindowVisible(hwnd).as_bool() {
                return Err("Could not show the fullscreen input window without activation".into());
            }
            mock_diagnostic(format_args!(
                "ready host_shown previous_foreground_preserved={}",
                target.foreground_unchanged()
            ));
            let taskbar: ITaskbarList2 = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER)
                .map_err(|error| error.to_string())?;
            taskbar.HrInit().map_err(|error| error.to_string())?;
            let _ = taskbar.DeleteTab(hwnd);
            taskbar
                .MarkFullscreenWindow(hwnd, true)
                .map_err(|error| error.to_string())?;
            if !target.foreground_unchanged() {
                return Err("Foreground changed before fullscreen input activation".into());
            }
            let hook = SetWindowsHookExW(WH_MOUSE_LL, Some(handoff_on_source_click), None, 0)
                .map_err(|error| error.to_string())?;
            let handoff = MouseHandoffHook(hook.0 as isize);
            let requested = SetForegroundWindow(hwnd).as_bool();
            let owns_foreground = GetForegroundWindow() == hwnd;
            mock_diagnostic(format_args!(
                "ready host_marked activation_requested={requested} owns_foreground={owns_foreground}"
            ));
            if !requested || !owns_foreground {
                return Err("Windows declined fullscreen input activation".into());
            }
            Ok((hwnd.0 as isize, handoff))
        }
    }

    pub(super) async fn ready(window: WebviewWindow, id: String) -> Result<bool, String> {
        mock_diagnostic(format_args!("ready received"));
        let app = window.app_handle().clone();
        on_main(&app, move || {
            let target = {
                let state = state();
                let Some(session) = state.session.as_ref().filter(|session| session.id == id)
                else {
                    return false;
                };
                if session.host.is_some() {
                    return true;
                }
                session.target
            };
            match activate(&window, target) {
                Ok((hwnd, handoff)) => {
                    if let Some(session) =
                        state().session.as_mut().filter(|session| session.id == id)
                    {
                        session.host = Some(hwnd);
                        session.mouse_handoff = Some(handoff);
                    }
                    log::debug!("全屏输入窗已激活");
                    true
                }
                Err(error) => {
                    log::debug!("全屏输入不可用：{error}");
                    mock_diagnostic(format_args!("ready activation_failed={error}"));
                    complete(window.app_handle(), &id, unavailable(target), true);
                    false
                }
            }
        })
        .await
    }

    fn complete(app: &AppHandle, id: &str, completion: Completion, close_host: bool) {
        let mut session = {
            let mut state = state();
            if state
                .session
                .as_ref()
                .is_none_or(|session| session.id != id)
            {
                return;
            }
            state.session.take().unwrap()
        };
        drop(session.mouse_handoff.take());
        if close_host {
            if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
                if let Ok(hwnd) = window.hwnd() {
                    let original = as_hwnd(session.target.foreground);
                    unsafe {
                        if GetForegroundWindow() == HWND(hwnd.0)
                            && usable(original)
                            && process_id(original) == session.target.foreground_pid
                        {
                            let _ = SetForegroundWindow(original);
                        }
                        // 对称使用 Win32，Tao 仍记录该临时窗的初始隐藏状态。
                        let _ = ShowWindow(HWND(hwnd.0), SW_HIDE);
                    }
                }
                let _ = window.destroy();
            }
        }
        let result = match completion {
            Completion::Fallback => None,
            Completion::Cancelled => Some(FullscreenInputResult {
                text: session.draft,
                send: false,
            }),
            Completion::Finished(result) => Some(result),
        };
        let _ = session.completion.send(result);
    }

    pub(super) async fn finish(
        window: WebviewWindow,
        id: String,
        result: FullscreenInputResult,
    ) -> Result<(), String> {
        let app = window.app_handle().clone();
        let current_id = id.clone();
        let target = state()
            .session
            .as_ref()
            .filter(|session| session.id == current_id && session.host.is_some())
            .map(|session| session.target);
        if let Some(target) = target {
            let recovering_fullscreen = on_main(&app, move || {
                target.foreground_unchanged()
                    && client_bounds(as_hwnd(target.foreground)).is_some_and(|client| {
                        target.covers_fullscreen_area(client) && !contains(client, target.monitor)
                    })
            })
            .await?;
            if recovering_fullscreen {
                // 目标窗恢复最后一个像素时保留输入层的全屏标记，避免交接期间任务栏浮起。
                tokio::time::sleep(FULLSCREEN_HANDOFF_GRACE).await;
            }
        }
        on_main(&app, move || {
            let valid = {
                let state = state();
                state.session.as_ref().is_some_and(|session| {
                    session.id == id
                        && session.host.is_some()
                        && result.text.len() <= 4096
                        && (!result.send
                            || result.text.encode_utf16().count() <= session.max_length)
                })
            };
            if valid {
                complete(window.app_handle(), &id, Completion::Finished(result), true);
            }
        })
        .await
    }

    fn id_for_source(label: &str) -> Option<String> {
        state()
            .session
            .as_ref()
            .filter(|session| session.source_label == label)
            .map(|session| session.id.clone())
    }

    pub(super) async fn cancel(window: WebviewWindow) -> Result<(), String> {
        let app = window.app_handle().clone();
        on_main(&app, move || {
            if let Some(id) = id_for_source(window.label()) {
                complete(window.app_handle(), &id, Completion::Cancelled, true);
            }
        })
        .await
    }

    async fn watch_session(app: AppHandle, id: String) {
        let start = Instant::now();
        let mut blur_since = None;
        loop {
            tokio::time::sleep(WATCH_INTERVAL).await;
            let snapshot = state()
                .session
                .as_ref()
                .filter(|session| session.id == id)
                .map(|session| (session.host, session.target));
            let Some((host, target)) = snapshot else {
                return;
            };
            let close = if let Some(host) = host {
                if !active_session_lost(host, target) {
                    blur_since = None;
                    false
                } else {
                    blur_since.get_or_insert_with(Instant::now).elapsed() >= BLUR_GRACE
                }
            } else {
                start.elapsed() >= STARTUP_LIMIT
            };
            if close {
                let app_for_close = app.clone();
                let active = host.is_some();
                let current_id = id.clone();
                let finished = on_main(&app, move || {
                    let current = state()
                        .session
                        .as_ref()
                        .filter(|session| session.id == current_id)
                        .map(|session| (session.host, session.target));
                    match current {
                        None => true,
                        Some((None, target)) if !active => {
                            mock_diagnostic(format_args!("ready host_timeout"));
                            complete(&app_for_close, &current_id, unavailable(target), true);
                            true
                        }
                        Some((Some(host), target))
                            if active && active_session_lost(host, target) =>
                        {
                            log_mock_host_loss(host, target);
                            complete(&app_for_close, &current_id, Completion::Cancelled, true);
                            true
                        }
                        _ => false,
                    }
                })
                .await
                .unwrap_or(true);
                if finished {
                    return;
                }
                blur_since = None;
            }
        }
    }

    fn active_session_lost(host: isize, target: Target) -> bool {
        let foreground = unsafe { GetForegroundWindow() };
        foreground != as_hwnd(host) || !target.remains_fullscreen()
    }

    fn log_mock_host_loss(host: isize, target: Target) {
        if !crate::bili::mock::is_enabled() {
            return;
        }
        let foreground = unsafe { GetForegroundWindow() };
        let source = as_hwnd(target.source);
        let original = as_hwnd(target.foreground);
        let mut class = [0; 128];
        let class_length = unsafe { GetClassNameW(foreground, &mut class) }.max(0) as usize;
        let class = String::from_utf16_lossy(&class[..class_length]);
        let foreground_role = if foreground == as_hwnd(host) {
            "host"
        } else if foreground == source {
            "source"
        } else if foreground == original {
            "target"
        } else {
            "other"
        };
        let source_visible = unsafe { IsWindowVisible(source).as_bool() };
        let source_minimized = unsafe { IsIconic(source).as_bool() };
        let source_client = client_bounds(source);
        let source_bounds_match = source_client == Some(target.source_bounds);
        let target_visible = unsafe { IsWindowVisible(original).as_bool() };
        let target_minimized = unsafe { IsIconic(original).as_bool() };
        let target_client = client_bounds(original);
        let target_covers_monitor =
            target_client.is_some_and(|rect| target.covers_fullscreen_area(rect));
        let target_pid_matches = process_id(original) == target.foreground_pid;
        mock_diagnostic(format_args!(
            "active host_lost foreground={foreground_role} class={class} foreground_pid={} \
             source_visible={source_visible} source_minimized={source_minimized} \
             source_bounds_match={source_bounds_match} source_client={source_client:?} expected_source={:?} \
             target_visible={target_visible} target_minimized={target_minimized} \
             target_pid_matches={target_pid_matches} target_covers_monitor={target_covers_monitor} \
             target_client={target_client:?} expected_monitor={:?}",
            process_id(foreground),
            target.source_bounds,
            target.monitor
        ));
    }

    pub(super) fn on_window_event(window: &Window, event: &WindowEvent) {
        let event_name = match event {
            WindowEvent::Destroyed => "destroyed",
            WindowEvent::CloseRequested { .. } => "close_requested",
            WindowEvent::Moved(_) => "moved",
            WindowEvent::Resized(_) => "resized",
            WindowEvent::ScaleFactorChanged { .. } => "scale_changed",
            WindowEvent::Focused(true) => "focused",
            WindowEvent::Focused(false) => "blurred",
            _ => "other",
        };
        if matches!(event, WindowEvent::Focused(_)) {
            let state = state();
            if state.session.as_ref().is_some_and(|session| {
                window.label() == OVERLAY_LABEL || window.label() == session.source_label
            }) {
                mock_diagnostic(format_args!("window {} {event_name}", window.label()));
            }
        }
        let destroyed = matches!(event, WindowEvent::Destroyed);
        let close = matches!(event, WindowEvent::CloseRequested { .. });
        let geometry = matches!(
            event,
            WindowEvent::Moved(_)
                | WindowEvent::Resized(_)
                | WindowEvent::ScaleFactorChanged { .. }
        );
        if window.label() == OVERLAY_LABEL && (destroyed || close) {
            let id = state().session.as_ref().map(|session| session.id.clone());
            if let Some(id) = id {
                mock_diagnostic(format_args!("window {} {event_name}", window.label()));
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                }
                complete(window.app_handle(), &id, Completion::Cancelled, !destroyed);
            }
        } else if is_source(window.label()) && (destroyed || close || geometry) {
            if let Some(id) = id_for_source(window.label()) {
                mock_diagnostic(format_args!("window {} {event_name}", window.label()));
                complete(window.app_handle(), &id, Completion::Cancelled, true);
            }
        }
    }
}
