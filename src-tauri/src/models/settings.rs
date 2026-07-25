#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RangeSetting {
    pub min: f64,
    pub max: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitSetting {
    pub max_per_window: u32,
    pub window_sec: u32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskControlSetting {
    pub random_interval: bool,
    pub jitter: bool,
    pub auto_pause_on_mute: bool,
    pub append_random_suffix: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiveSetting {
    pub auto_connect: bool,
    pub auto_reconnect: bool,
    pub reconnect_interval: u32,
    pub max_reconnect_interval: u32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSetting {
    pub theme: String,
    pub font_size: u32,
    pub show_medal: bool,
    pub show_level: bool,
    #[serde(default)]
    pub hide_glory_level: bool,
    #[serde(default)]
    pub hide_fan_medal: bool,
    #[serde(default)]
    pub hide_admin_badge: bool,
    #[serde(default)]
    pub hide_user_id_color: bool,
    #[serde(default)]
    pub hide_username: bool,
    #[serde(default)]
    pub hide_entry_message: bool,
    #[serde(default)]
    pub hide_like_message: bool,
    #[serde(default)]
    pub hide_contribution_rank: bool,
    #[serde(default = "default_opacity")]
    pub opacity: u32,
    /// 表情显示样式：hidden / text / image
    #[serde(default = "default_emoticon_style")]
    pub emoticon_style: String,
}

fn default_opacity() -> u32 {
    90
}

fn default_emoticon_style() -> String {
    "image".into()
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSetting {
    pub mute_alert: bool,
    pub cookie_expiry: bool,
    pub send_success: bool,
    pub sc_alert: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSetting {
    /// 默认音量百分比 (0~100)
    pub default_volume: u32,
    /// 进入直播间时自动播放音频
    pub auto_play: bool,
}

impl Default for AudioSetting {
    fn default() -> Self {
        Self {
            default_volume: 80,
            auto_play: false,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SttSetting {
    pub enabled: bool,
    /// Model ID: "large" or "xlarge"
    pub model_id: String,
    /// Sync delay in ms (-2000 ~ +2000)
    pub sync_delay_ms: i32,
}

impl Default for SttSetting {
    fn default() -> Self {
        Self {
            enabled: false,
            model_id: "large".to_string(),
            sync_delay_ms: 0,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheSetting {
    /// 弹幕消息缓存上限，0 表示无限制
    pub danmaku_limit: u32,
    /// 礼物消息缓存上限，0 表示无限制
    pub gift_limit: u32,
}

impl Default for CacheSetting {
    fn default() -> Self {
        Self {
            danmaku_limit: 200,
            gift_limit: 100,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockedUser {
    pub uid: u64,
    pub username: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterSetting {
    pub blocked_users: Vec<BlockedUser>,
    pub blocked_keywords: Vec<String>,
}

impl Default for FilterSetting {
    fn default() -> Self {
        Self {
            blocked_users: Vec::new(),
            blocked_keywords: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub send_interval: RangeSetting,
    pub rate_limit: RateLimitSetting,
    pub risk_control: RiskControlSetting,
    pub receive: ReceiveSetting,
    pub appearance: AppearanceSetting,
    pub notification: NotificationSetting,
    #[serde(default)]
    pub cache: CacheSetting,
    #[serde(default)]
    pub audio: AudioSetting,
    #[serde(default)]
    pub stt: SttSetting,
    #[serde(default)]
    pub filter: FilterSetting,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            send_interval: RangeSetting { min: 1.5, max: 3.0 },
            rate_limit: RateLimitSetting {
                max_per_window: 20,
                window_sec: 30,
            },
            risk_control: RiskControlSetting {
                random_interval: true,
                jitter: true,
                auto_pause_on_mute: true,
                append_random_suffix: false,
            },
            receive: ReceiveSetting {
                auto_connect: true,
                auto_reconnect: true,
                reconnect_interval: 5,
                max_reconnect_interval: 60,
            },
            appearance: AppearanceSetting {
                theme: "system".into(),
                font_size: 14,
                show_medal: true,
                show_level: true,
                hide_glory_level: false,
                hide_fan_medal: false,
                hide_admin_badge: false,
                hide_user_id_color: false,
                hide_username: false,
                hide_entry_message: false,
                hide_like_message: false,
                hide_contribution_rank: false,
                opacity: 90,
                emoticon_style: default_emoticon_style(),
            },
            notification: NotificationSetting {
                mute_alert: true,
                cookie_expiry: true,
                send_success: false,
                sc_alert: false,
            },
            cache: CacheSetting::default(),
            audio: AudioSetting::default(),
            stt: SttSetting::default(),
            filter: FilterSetting::default(),
        }
    }
}
