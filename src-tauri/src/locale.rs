use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewWindow};

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub enum Locale {
    #[default]
    #[serde(rename = "zh-CN")]
    ZhCn,
    #[serde(rename = "en")]
    En,
}

impl Locale {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "zh-CN" => Some(Self::ZhCn),
            "en" => Some(Self::En),
            _ => None,
        }
    }

    pub fn from_settings_value(value: &serde_json::Value) -> Self {
        value.as_str().and_then(Self::parse).unwrap_or_default()
    }

    pub fn messages(self) -> &'static NativeMessages {
        match self {
            Self::ZhCn => &ZH_CN,
            Self::En => &EN,
        }
    }
}

pub fn deserialize_setting<'de, D>(deserializer: D) -> Result<Locale, D::Error>
where
    D: serde::Deserializer<'de>,
{
    serde_json::Value::deserialize(deserializer).map(|value| Locale::from_settings_value(&value))
}

pub struct NativeMessages {
    pub account_empty: &'static str,
    pub accounts: &'static str,
    pub rooms_empty: &'static str,
    pub rooms_offline: &'static str,
    pub rooms: &'static str,
    pub quit: &'static str,
    pub room: &'static str,
    pub danmaku_window: &'static str,
    pub video_danmaku: &'static str,
}

const ZH_CN: NativeMessages = NativeMessages {
    account_empty: "账号：未登录",
    accounts: "账号",
    rooms_empty: "直播间：暂无",
    rooms_offline: "直播间：暂无开播",
    rooms: "直播间",
    quit: "退出",
    room: "房间",
    danmaku_window: "弹幕窗口",
    video_danmaku: "视频弹幕",
};

const EN: NativeMessages = NativeMessages {
    account_empty: "Account: Signed out",
    accounts: "Accounts",
    rooms_empty: "Live rooms: None",
    rooms_offline: "Live rooms: None online",
    rooms: "Live rooms",
    quit: "Quit",
    room: "Room",
    danmaku_window: "Danmaku window",
    video_danmaku: "Video danmaku",
};

pub fn refresh_window_title(window: &WebviewWindow) -> tauri::Result<()> {
    match window.label() {
        crate::commands::room::DANMAKU_WINDOW_LABEL => {
            crate::commands::room::refresh_danmaku_window_title(window)
        }
        crate::commands::video_window::LABEL => {
            crate::commands::video_window::refresh_window_title(window)
        }
        _ => Ok(()),
    }
}

pub fn refresh_native_ui(app: &AppHandle) {
    if let Err(error) = crate::tray::refresh_tray(app) {
        log::warn!("Could not schedule localized tray refresh: {error}");
    }
    let handle = app.clone();
    if let Err(error) = app.run_on_main_thread(move || {
        for window in handle.webview_windows().values() {
            if let Err(error) = refresh_window_title(window) {
                log::warn!("Could not refresh title for {}: {error}", window.label());
            }
        }
    }) {
        log::warn!("Could not schedule localized window titles: {error}");
    }
}
