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

/// 活动栏（进场/点赞）显示模式：hidden / latest / scroll
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ActivityBarMode {
    Hidden,
    #[default]
    Latest,
    Scroll,
}

impl<'de> serde::Deserialize<'de> for ActivityBarMode {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = String::deserialize(deserializer)?;
        Ok(match value.as_str() {
            "hidden" => Self::Hidden,
            "scroll" => Self::Scroll,
            // 未知值回退默认，避免单个坏字段导致整份设置加载失败
            _ => Self::default(),
        })
    }
}

impl serde::Serialize for ActivityBarMode {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(match self {
            Self::Hidden => "hidden",
            Self::Latest => "latest",
            Self::Scroll => "scroll",
        })
    }
}

/// 活动栏过滤：all / entry / like
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ActivityFilter {
    #[default]
    All,
    Entry,
    Like,
}

impl<'de> serde::Deserialize<'de> for ActivityFilter {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = String::deserialize(deserializer)?;
        Ok(match value.as_str() {
            "entry" => Self::Entry,
            "like" => Self::Like,
            _ => Self::default(),
        })
    }
}

impl serde::Serialize for ActivityFilter {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(match self {
            Self::All => "all",
            Self::Entry => "entry",
            Self::Like => "like",
        })
    }
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
    pub hide_contribution_rank: bool,
    #[serde(default = "default_opacity")]
    pub opacity: u32,
    /// 表情显示样式：hidden / text / image
    #[serde(default = "default_emoticon_style")]
    pub emoticon_style: String,
    /// 活动栏（进场/点赞）显示模式：hidden / latest / scroll
    #[serde(default)]
    pub activity_bar_mode: ActivityBarMode,
    /// 活动栏过滤：all / entry / like
    #[serde(default)]
    pub activity_filter: ActivityFilter,
    /// 是否在弹幕栏额外显示简化版醒目留言
    #[serde(default)]
    pub sc_in_danmaku: bool,
    /// 侧边吸附收起/展开动画时长（毫秒），0 为关闭动画
    #[serde(default = "default_dock_anim_ms")]
    pub dock_anim_ms: u32,
    /// 自定义主题色（亮色模式 hex，空 = 默认石墨）
    #[serde(default)]
    pub theme_accent_light: String,
    /// 自定义主题色（暗色模式 hex，空 = 默认石墨）
    #[serde(default)]
    pub theme_accent_dark: String,
    /// 弹幕窗口标题栏各按钮的显隐（默认全部显示）
    #[serde(default)]
    pub title_bar_buttons: TitleBarButtons,
}

fn default_true() -> bool {
    true
}

/// 弹幕窗口标题栏按钮显隐设置：false = 从标题栏移除该按钮。
/// 字段级 serde 默认保证旧数据（无此对象或缺字段）升级后按钮不消失。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleBarButtons {
    /// 置顶
    #[serde(default = "default_true")]
    pub pin: bool,
    /// 锁定位置
    #[serde(default = "default_true")]
    pub lock: bool,
    /// 仅输入框模式
    #[serde(default = "default_true")]
    pub input_only: bool,
    /// 窗口透传
    #[serde(default = "default_true")]
    pub passthrough: bool,
    /// 隐藏到托盘（关闭按钮）
    #[serde(default = "default_true")]
    pub close: bool,
    /// 房间切换胶囊
    #[serde(default = "default_true")]
    pub room_switcher: bool,
}

impl Default for TitleBarButtons {
    fn default() -> Self {
        Self {
            pin: true,
            lock: true,
            input_only: true,
            passthrough: true,
            close: true,
            room_switcher: true,
        }
    }
}

fn default_dock_anim_ms() -> u32 {
    220
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
#[serde(default, rename_all = "camelCase")]
pub struct ListenSetting {
    pub show_covers: bool,
    pub auto_next: bool,
    pub subtitle_font_size: u32,
    pub subtitle_auto_follow: bool,
    pub subtitle_show_time: bool,
}

impl Default for ListenSetting {
    fn default() -> Self {
        Self {
            show_covers: true,
            auto_next: true,
            subtitle_font_size: 16,
            subtitle_auto_follow: true,
            subtitle_show_time: false,
        }
    }
}

fn default_sc_toggle_window() -> Option<String> {
    Some("Ctrl+Alt+D".into())
}

fn default_sc_toggle_input_only() -> Option<String> {
    // 对齐参考项目 live-moyu 的悬浮输入框唤起键
    Some("Ctrl+Alt+B".into())
}

fn default_sc_zoom_in() -> Option<String> {
    Some("Ctrl+=".into())
}

fn default_sc_zoom_out() -> Option<String> {
    Some("Ctrl+-".into())
}

fn default_sc_zoom_reset() -> Option<String> {
    Some("Ctrl+0".into())
}

/// 快捷键绑定：全局动作经 global-shortcut 插件注册（None = 未绑定），
/// 界面缩放三键在应用内解析（Rust 侧仅存储，不注册）。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutsSetting {
    /// 显示/隐藏应用窗口（与托盘左键同语义）
    #[serde(default = "default_sc_toggle_window")]
    pub toggle_window: Option<String>,
    /// 弹幕窗进入/退出仅输入框模式
    #[serde(default = "default_sc_toggle_input_only")]
    pub toggle_input_only: Option<String>,
    /// 直播音频播放/暂停
    #[serde(default)]
    pub toggle_audio: Option<String>,
    /// 直播音频静音切换
    #[serde(default)]
    pub toggle_mute: Option<String>,
    /// 界面放大（应用内）
    #[serde(default = "default_sc_zoom_in")]
    pub ui_zoom_in: Option<String>,
    /// 界面缩小（应用内）
    #[serde(default = "default_sc_zoom_out")]
    pub ui_zoom_out: Option<String>,
    /// 界面缩放重置（应用内）
    #[serde(default = "default_sc_zoom_reset")]
    pub ui_zoom_reset: Option<String>,
}

impl Default for ShortcutsSetting {
    fn default() -> Self {
        Self {
            toggle_window: default_sc_toggle_window(),
            toggle_input_only: default_sc_toggle_input_only(),
            toggle_audio: None,
            toggle_mute: None,
            ui_zoom_in: default_sc_zoom_in(),
            ui_zoom_out: default_sc_zoom_out(),
            ui_zoom_reset: default_sc_zoom_reset(),
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
    /// 三栏（弹幕/礼物/动态消息）共用的消息缓存上限，0 表示无限制。
    /// alias 兼容旧版单弹幕上限字段：旧持久化数据无需迁移即可读取。
    #[serde(default = "default_message_limit", alias = "danmakuLimit")]
    pub message_limit: u32,
}

impl Default for CacheSetting {
    fn default() -> Self {
        Self {
            message_limit: default_message_limit(),
        }
    }
}

fn default_message_limit() -> u32 {
    200
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
#[serde(default, rename_all = "camelCase")]
pub struct VisualProfile {
    pub accent: String,
    pub background: String,
    pub foreground: String,
    pub font_family: String,
    pub content_font_family: String,
}

impl Default for VisualProfile {
    fn default() -> Self {
        Self {
            accent: String::new(),
            background: String::new(),
            foreground: String::new(),
            font_family: "system".into(),
            content_font_family: "inherit".into(),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct VisualSetting {
    pub light: VisualProfile,
    pub dark: VisualProfile,
    pub ui_font_size: u32,
    pub content_font_size: u32,
    pub contrast: u32,
}

impl Default for VisualSetting {
    fn default() -> Self {
        Self {
            light: VisualProfile::default(),
            dark: VisualProfile::default(),
            ui_font_size: 14,
            content_font_size: 14,
            contrast: 40,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub visual: VisualSetting,
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
    pub listen: ListenSetting,
    #[serde(default)]
    pub stt: SttSetting,
    #[serde(default)]
    pub filter: FilterSetting,
    /// 全局与应用内快捷键绑定
    #[serde(default)]
    pub shortcuts: ShortcutsSetting,
    /// 关闭主窗口行为：ask（每次询问）/ hide（隐藏到托盘）/ exit（退出程序）
    #[serde(default = "default_close_behavior")]
    pub close_behavior: String,
    /// 静默启动：启动时不显示主页面，只在系统托盘常驻
    #[serde(default)]
    pub silent_start: bool,
    /// 在直播间列表、添加主播、账号与视频评论中展示头像
    #[serde(default)]
    pub show_avatars: bool,
}

fn default_close_behavior() -> String {
    "ask".into()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            visual: VisualSetting::default(),
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
                hide_contribution_rank: false,
                opacity: 90,
                emoticon_style: default_emoticon_style(),
                activity_bar_mode: ActivityBarMode::default(),
                activity_filter: ActivityFilter::default(),
                sc_in_danmaku: false,
                dock_anim_ms: default_dock_anim_ms(),
                theme_accent_light: String::new(),
                theme_accent_dark: String::new(),
                title_bar_buttons: TitleBarButtons::default(),
            },
            notification: NotificationSetting {
                mute_alert: true,
                cookie_expiry: true,
                send_success: false,
                sc_alert: false,
            },
            cache: CacheSetting::default(),
            audio: AudioSetting::default(),
            listen: ListenSetting::default(),
            stt: SttSetting::default(),
            filter: FilterSetting::default(),
            shortcuts: ShortcutsSetting::default(),
            close_behavior: default_close_behavior(),
            silent_start: false,
            show_avatars: true,
        }
    }
}
