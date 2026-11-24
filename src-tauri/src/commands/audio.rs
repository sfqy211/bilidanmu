//! 音频输出设备相关命令。

/// 为当前窗口的 origin 授予 WebView2「麦克风」权限。
///
/// 前端枚举音频**输出**设备（`enumerateDevices`）时，Chromium 只有在 origin
/// 获得麦克风权限后才返回真实的 `deviceId` / `label`，否则只返回一个空设备。
/// 这里直接写 WebView2 profile 的权限状态，不调用 `getUserMedia`：
/// 不会启动采集、不会闪麦克风占用提示，也不会弹出系统/浏览器权限框。
///
/// 权限是持久化在 WebView2 profile 里的（按 origin），只对应用自己的本地页面生效。
#[tauri::command]
pub async fn prepare_audio_device_list(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2Profile4, ICoreWebView2_13, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
            COREWEBVIEW2_PERMISSION_STATE_ALLOW,
        };
        use webview2_com::SetPermissionStateCompletedHandler;
        use windows_core::{Interface, HSTRING};

        let url = window.url().map_err(|error| error.to_string())?;
        // 只允许应用自己的本地页面，避免任何远程页面借这个命令拿到麦克风权限
        let local_host = matches!(
            url.host_str(),
            Some("tauri.localhost") | Some("localhost") | Some("127.0.0.1")
        );
        if !local_host {
            return Err("audio device listing is only allowed for the app's local origin".into());
        }
        let origin = HSTRING::from(url.origin().ascii_serialization());

        window
            .with_webview(move |webview| {
                let result = (|| -> windows_core::Result<()> {
                    let controller = webview.controller();
                    let core = unsafe { controller.CoreWebView2() }?;
                    let profile = unsafe { core.cast::<ICoreWebView2_13>()?.Profile()? };
                    let profile4 = profile.cast::<ICoreWebView2Profile4>()?;
                    let handler = SetPermissionStateCompletedHandler::create(Box::new(|_| Ok(())));
                    unsafe {
                        profile4.SetPermissionState(
                            COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
                            &origin,
                            COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                            &handler,
                        )?;
                    }
                    Ok(())
                })();
                if let Err(error) = result {
                    log::warn!("[audio] 授予设备枚举权限失败: {error}");
                }
            })
            .map_err(|error| error.to_string())?;

        Ok(())
    }

    #[cfg(not(windows))]
    {
        let _ = window;
        Err("audio output device selection is not supported on this platform".into())
    }
}
