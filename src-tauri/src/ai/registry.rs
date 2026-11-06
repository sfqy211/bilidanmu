//! 工具注册表：每个工具的规格（给模型看）+ 执行入口。
//!
//! 规格与实现放在一起，避免"文档写了一套、代码里是另一套"。
//! 分发走 [`dispatch_tool`]，由 [`crate::ai::dispatch`] 在权限闸门之后调用。

use crate::ai::spec::{Risk, ToolError, ToolSpec};
use crate::ai::tools;
use crate::AppState;
use serde_json::json;

/// 全部工具的执行入口。
///
/// 传入已通过权限检查的调用；返回业务结果或结构化错误。
pub async fn dispatch_tool(
    app: &tauri::AppHandle,
    state: &AppState,
    name: &str,
    args: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    match name {
        // ── 应用 ──────────────────────────────────────────────
        "app_get_status" => tools::app::get_status(app, state).await,
        "app_refresh_rooms" => tools::app::refresh_rooms(app, state).await,
        "app_reveal_window" => tools::app::reveal_main_window(app, state).await,
        "app_get_permission" => tools::settings::get_permission(state).await,

        // ── 直播上下文 ────────────────────────────────────────
        "live_get_context" => tools::live::get_context(app, state, args).await,
        "live_query_danmaku" => tools::live::query_danmaku(app, state, args).await,
        "live_get_stats" => tools::live::get_stats(app, state, args).await,

        // ── 账号 ──────────────────────────────────────────────
        "account_list" => tools::account::list(app, state, args).await,
        "account_get_current" => tools::account::get_current(app, state, args).await,
        "account_get_wallet" => tools::account::get_wallet(app, state, args).await,
        "account_switch" => tools::account::switch(app, state, args).await,
        "account_remove" => tools::account::remove(app, state, args).await,

        // ── 房间 ──────────────────────────────────────────────
        "room_list" => tools::room::list(app, state, args).await,
        "room_search" => tools::room::search(app, state, args).await,
        "room_get" => tools::room::get(app, state, args).await,
        "room_live_status" => tools::room::live_status(app, state, args).await,
        "room_follow_lives" => tools::room::follow_lives(app, state, args).await,
        "room_join" => tools::room::join(app, state, args).await,
        "room_leave" => tools::room::leave(app, state, args).await,

        // ── 弹幕 ──────────────────────────────────────────────
        "danmaku_get_emoticons" => tools::danmaku::get_emoticons(app, state, args).await,
        "danmaku_send" => tools::danmaku::send(app, state, args).await,
        "danmaku_send_emoticon" => tools::danmaku::send_emoticon(app, state, args).await,
        "danmaku_like" => tools::danmaku::like(app, state, args).await,
        "template_list" => tools::danmaku::list_templates(app, state, args).await,
        "template_save" => tools::danmaku::save_template(app, state, args).await,
        "template_delete" => tools::danmaku::delete_template(app, state, args).await,

        // ── 礼物 ──────────────────────────────────────────────
        "gift_list" => tools::gift::list(app, state, args).await,
        "gift_bag" => tools::gift::bag(app, state, args).await,
        "gift_send" => tools::gift::send(app, state, args).await,

        // ── 视频 ──────────────────────────────────────────────
        "video_search" => tools::video::search(app, state, args).await,
        "video_get_info" => tools::video::get_info(app, state, args).await,
        "video_get_subtitle" => tools::video::get_subtitle(app, state, args).await,
        "video_get_comments" => tools::video::get_comments(app, state, args).await,
        "video_get_replies" => tools::video::get_replies(app, state, args).await,
        "video_fav_folders" => tools::video::fav_folders(app, state, args).await,
        "video_fav_list" => tools::video::fav_list(app, state, args).await,
        "video_watch_later" => tools::video::watch_later(app, state, args).await,
        "video_play" => tools::video::play(app, state, args).await,
        "video_stop" => tools::video::stop(app, state, args).await,
        "video_comment_like" => tools::video::like_comment(app, state, args).await,
        "video_comment_post" => tools::video::post_comment(app, state, args).await,

        // ── 设置 ──────────────────────────────────────────────
        "settings_get" => tools::settings::get_keys(state, args).await,
        "settings_patch" => tools::settings::patch(app, state, args).await,

        _ => Err(ToolError::unknown_tool(name)),
    }
}

/// 全部工具规格。`tools/list` 直接用它。
pub fn all_specs() -> Vec<ToolSpec> {
    vec![
        // ── 应用 ──────────────────────────────────────────────
        ToolSpec {
            name: "app_get_status",
            title: "应用总览",
            description: "一次性拿到应用整体状态：版本、登录态、当前房间、WebSocket 连接、礼物功能是否可用、AI 权限模式、MCP 服务状态、是否处于虚拟直播间。\
任何任务开始的第一个调用，用来判断当前环境能做什么。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "app_refresh_rooms",
            title: "刷新房间信息",
            description: "重新拉取所有已保存房间的标题、封面和开播状态。当用户说房间列表信息过期时调用。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "app_reveal_window",
            title: "显示主窗口",
            description: "把主窗口显示出来并聚焦。AI 完成操作后需要用户查看界面时调用。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "app_get_permission",
            title: "查询权限模式",
            description: "返回当前 AI 权限模式（变更前确认 / 自主模式 / 完全访问）与三种模式的含义。\
调用写操作前若不确定是否需要用户确认，先用它判断。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            })),
        },

        // ── 直播上下文 ────────────────────────────────────────
        ToolSpec {
            name: "live_get_context",
            title: "直播间全貌",
            description: "理解当前直播间的首选工具。一次返回：房间与主播名、实时标题、是否开播与已播时长、人气/在线/看过/点赞、每分钟弹幕数、\
最近的弹幕条目、最近礼物与醒目留言、发言最多的观众、礼物汇总。\
用户问『现在直播间什么情况』『大家在聊什么』时先调它，不要自己拼多条事件。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "danmakuLimit": { "type": "integer", "minimum": 1, "maximum": 300, "default": 40, "description": "返回最近多少条弹幕" },
                    "giftLimit": { "type": "integer", "minimum": 0, "maximum": 200, "default": 20, "description": "返回最近多少条礼物/SC" },
                    "includeActivity": { "type": "boolean", "default": false, "description": "是否附带进场/点赞等轻量活动" }
                },
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "live_query_danmaku",
            title: "检索弹幕",
            description: "在已缓冲的弹幕里按关键词检索（匹配内容或用户名），或直接取最近 N 条。\
当 live_get_context 返回的弹幕不够、或用户问『有没有人提到 X』时使用。缓冲区只保留最近 2000 条，不含历史回放。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "keyword": { "type": "string", "description": "关键词，省略则返回最近弹幕" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 300, "default": 50 }
                },
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "live_get_stats",
            title: "直播指标",
            description: "只取实时指标（人气、在线、看过、点赞、弹幕速率），不返回弹幕正文。高频轮询时用它省 token。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            })),
        },

        // ── 账号 ──────────────────────────────────────────────
        ToolSpec {
            name: "account_list",
            title: "账号列表",
            description: "列出所有已登录账号（不含 cookie 等凭据）。需要知道有哪些账号可切换时调用。",
            risk: Risk::Read,
            input_schema: schema(json!({ "type": "object", "properties": {}, "additionalProperties": false })),
        },
        ToolSpec {
            name: "account_get_current",
            title: "当前账号",
            description: "当前登录状态：是否登录、账号 id、能否发送。写操作前用它确认登录态。",
            risk: Risk::Read,
            input_schema: schema(json!({ "type": "object", "properties": {}, "additionalProperties": false })),
        },
        ToolSpec {
            name: "account_get_wallet",
            title: "瓜子余额",
            description: "查询金瓜子/银瓜子余额。送礼前用它可以核对预算。礼物功能未编译时返回 FEATURE_DISABLED。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "roomId": { "type": "integer", "description": "房间号，省略则用当前直播间" }
                },
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "account_switch",
            title: "切换账号",
            description: "把当前活跃账号切到指定账号。会影响后续所有发送操作使用的身份。",
            risk: Risk::Write,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "accountId": { "type": "string", "description": "目标账号 id，来自 account_list" }
                },
                "required": ["accountId"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "account_remove",
            title: "删除账号",
            description: "删除指定账号的本地凭据。不可逆：需要用户重新扫码才能恢复。",
            risk: Risk::Destructive,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "accountId": { "type": "string", "description": "要删除的账号 id" }
                },
                "required": ["accountId"],
                "additionalProperties": false
            })),
        },

        // ── 房间 ──────────────────────────────────────────────
        ToolSpec {
            name: "room_list",
            title: "我的直播间列表",
            description: "列出已保存的直播间，合并了实时开播状态、标题与开播时间。要挑选房间时先调它。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "onlyLive": { "type": "boolean", "default": false, "description": "只返回正在直播的房间" }
                },
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "room_search",
            title: "搜索直播间",
            description: "按房间号、直播间链接或主播名搜索直播间。结果里含 roomId，可用于 room_join。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "keyword": { "type": "string", "description": "房间号 / 链接 / 主播名" },
                    "mode": { "type": "string", "enum": ["roomId", "link", "name"], "default": "name", "description": "搜索方式" }
                },
                "required": ["keyword"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "room_get",
            title: "房间详情",
            description: "查询单个房间的实时详情：标题、分区、简介、是否开播、主播 uid。主播 uid 是送礼必需的参数。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "roomId": { "type": "integer", "description": "房间号" }
                },
                "required": ["roomId"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "room_live_status",
            title: "开播状态",
            description: "所有已保存房间的实时开播状态（是否在播、当前标题、本次开播时间）。想判断『谁在播』时用它。",
            risk: Risk::Read,
            input_schema: schema(json!({ "type": "object", "properties": {}, "additionalProperties": false })),
        },
        ToolSpec {
            name: "room_follow_lives",
            title: "关注的主播在播",
            description: "拉取账号关注列表中正在直播的主播。需要登录。",
            risk: Risk::Read,
            input_schema: schema(json!({ "type": "object", "properties": {}, "additionalProperties": false })),
        },
        ToolSpec {
            name: "room_join",
            title: "进入直播间",
            description: "进入指定直播间：创建弹幕窗口、隐藏主窗口、切前端路由。效果与用户手动点击房间完全一致。\
房间必须已在本地保存列表中。",
            risk: Risk::Write,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "roomId": { "type": "integer", "description": "房间号" }
                },
                "required": ["roomId"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "room_leave",
            title: "离开直播间",
            description: "退出当前直播间：销毁弹幕窗口并回到主页面。",
            risk: Risk::Write,
            input_schema: schema(json!({ "type": "object", "properties": {}, "additionalProperties": false })),
        },

        // ── 弹幕 ──────────────────────────────────────────────
        ToolSpec {
            name: "danmaku_get_emoticons",
            title: "表情包列表",
            description: "拿到当前房间可用的表情包（含 emoticonUnique，用于 danmaku_send_emoticon）。优先读本地缓存。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "roomId": { "type": "integer", "description": "房间号，省略则用当前直播间" }
                },
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "danmaku_send",
            title: "发送弹幕",
            description: "在当前直播间发送一条文字弹幕。必须已登录。长度上限 20 字（B 站限制）；\
20 秒内相同文案会被拒绝以避免刷屏。发送间隔受用户设置里的发送频率限制约束。",
            risk: Risk::Costly,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "roomId": { "type": "integer", "description": "房间号，省略则用当前直播间" },
                    "message": { "type": "string", "description": "弹幕正文，最多 20 字" },
                    "color": { "type": "integer", "description": "文字颜色（十进制 RGB），省略用默认白色" },
                    "mode": { "type": "integer", "description": "弹幕模式：1/2/3 滚动，4 底部，5 顶部；省略用滚动" }
                },
                "required": ["message"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "danmaku_send_emoticon",
            title: "发送表情弹幕",
            description: "发送一个表情弹幕。emoticonUnique 必须来自 danmaku_get_emoticons 的返回。",
            risk: Risk::Costly,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "roomId": { "type": "integer", "description": "房间号，省略则用当前直播间" },
                    "emoticonUnique": { "type": "string", "description": "表情唯一标识" },
                    "emoticonOptions": { "type": "string", "description": "可选：完整的 emoticon_options JSON" }
                },
                "required": ["emoticonUnique"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "danmaku_like",
            title: "给直播间点赞",
            description: "给当前直播间点赞。clickTimes 为次数，1~100。需登录。",
            risk: Risk::Write,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "roomId": { "type": "integer", "description": "房间号，省略则用当前直播间" },
                    "anchorId": { "type": "integer", "description": "主播 uid，省略则从已保存房间读取" },
                    "clickTimes": { "type": "integer", "minimum": 1, "maximum": 100, "default": 10 }
                },
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "template_list",
            title: "消息模板列表",
            description: "列出用户保存的弹幕/消息模板。撰写弹幕前可参考用户既有风格。",
            risk: Risk::Read,
            input_schema: schema(json!({ "type": "object", "properties": {}, "additionalProperties": false })),
        },
        ToolSpec {
            name: "template_save",
            title: "保存消息模板",
            description: "新建（不带 id）或更新（带 id）一条消息模板。",
            risk: Risk::Write,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "id": { "type": "integer", "description": "省略为新建，给出则更新该模板" },
                    "title": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["title", "content"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "template_delete",
            title: "删除消息模板",
            description: "删除一条消息模板。",
            risk: Risk::Write,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "id": { "type": "integer" }
                },
                "required": ["id"],
                "additionalProperties": false
            })),
        },

        // ── 礼物 ──────────────────────────────────────────────
        ToolSpec {
            name: "gift_list",
            title: "礼物面板",
            description: "列出当前房间的礼物（名称、价格、金/银瓜子类型）。送礼前必须先调它拿到 giftId 与 price。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "roomId": { "type": "integer", "description": "房间号，省略则用当前直播间" }
                },
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "gift_bag",
            title: "礼物背包",
            description: "列出我的礼物背包。背包礼物不扣钱，直接发送即可。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "roomId": { "type": "integer", "description": "房间号，省略则用当前直播间" }
                },
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "gift_send",
            title: "发送礼物",
            description: "给当前直播间主播送礼物。金瓜子礼物会真实扣费（1000 金瓜子 = 1 元），必须同时提供 price；\
银瓜子与背包礼物不扣费。需要主播 ruid。送礼前应先调 gift_list 核对金额，并向用户说明总花费。",
            risk: Risk::Costly,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "roomId": { "type": "integer", "description": "房间号，省略则用当前直播间" },
                    "giftId": { "type": "integer", "description": "礼物 id，来自 gift_list 或 gift_bag" },
                    "giftNum": { "type": "integer", "minimum": 1, "maximum": 999, "default": 1 },
                    "coinType": { "type": "string", "enum": ["gold", "silver"], "default": "silver" },
                    "price": { "type": "integer", "description": "礼物单价（瓜子），金瓜子必填，1000 = 1 元" },
                    "ruid": { "type": "integer", "description": "主播 uid，省略则从已保存房间读取" },
                    "bagId": { "type": "integer", "description": "背包礼物 id，送背包礼物时提供" }
                },
                "required": ["giftId"],
                "additionalProperties": false
            })),
        },

        // ── 视频 ──────────────────────────────────────────────
        ToolSpec {
            name: "video_search",
            title: "搜索视频",
            description: "按关键词搜索 B 站视频，返回 bvid、标题、UP 主、时长、播放量等。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "keyword": { "type": "string" },
                    "page": { "type": "integer", "minimum": 1, "maximum": 50, "default": 1 }
                },
                "required": ["keyword"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "video_get_info",
            title: "视频详情",
            description: "查询单个视频的详情（标题、简介、UP 主、分P、cid 等）。后续字幕与评论都需要 cid/aid。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "bvid": { "type": "string", "description": "形如 BV1xx411c7mD" }
                },
                "required": ["bvid"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "video_get_subtitle",
            title: "视频字幕",
            description: "获取视频字幕文本（逐行带时间戳）。不传 cid 时自动从视频详情里取。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "bvid": { "type": "string" },
                    "cid": { "type": "integer", "description": "分P id，省略自动获取" }
                },
                "required": ["bvid"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "video_get_comments",
            title: "视频评论",
            description: "拉取视频一级评论。sort=1 按热度、sort=0 按时间。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "bvid": { "type": "string" },
                    "page": { "type": "integer", "minimum": 1, "maximum": 200, "default": 1 },
                    "sort": { "type": "integer", "enum": [0, 1], "default": 1, "description": "1=按热度，0=按时间" }
                },
                "required": ["bvid"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "video_get_replies",
            title: "评论的回复",
            description: "拉取某条评论下的楼中楼回复。root 为顶层评论的 rpid。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "bvid": { "type": "string" },
                    "root": { "type": "integer", "description": "顶层评论 rpid" },
                    "page": { "type": "integer", "minimum": 1, "maximum": 200, "default": 1 }
                },
                "required": ["bvid", "root"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "video_fav_folders",
            title: "收藏夹列表",
            description: "列出当前账号的收藏夹。需要登录。mediaId 可用于 video_fav_list。",
            risk: Risk::Read,
            input_schema: schema(json!({ "type": "object", "properties": {}, "additionalProperties": false })),
        },
        ToolSpec {
            name: "video_fav_list",
            title: "收藏夹内容",
            description: "列出某个收藏夹里的视频。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "mediaId": { "type": "integer", "description": "收藏夹 id，来自 video_fav_folders" },
                    "page": { "type": "integer", "minimum": 1, "maximum": 200, "default": 1 },
                    "size": { "type": "integer", "minimum": 1, "maximum": 50, "default": 20 }
                },
                "required": ["mediaId"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "video_watch_later",
            title: "稍后再看",
            description: "列出稍后再看列表。需要登录。",
            risk: Risk::Read,
            input_schema: schema(json!({ "type": "object", "properties": {}, "additionalProperties": false })),
        },
        ToolSpec {
            name: "video_play",
            title: "播放视频",
            description: "在桌面端打开并播放指定视频（切到听视频外壳）。会影响界面：主窗口会显示出来。",
            risk: Risk::Write,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "bvid": { "type": "string" }
                },
                "required": ["bvid"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "video_stop",
            title: "停止视频",
            description: "停止当前的视频音频播放。",
            risk: Risk::Write,
            input_schema: schema(json!({ "type": "object", "properties": {}, "additionalProperties": false })),
        },
        ToolSpec {
            name: "video_comment_like",
            title: "评论点赞",
            description: "给某条视频评论点赞或取消点赞。需要登录。oid 为视频 aid，rpid 为评论 id。",
            risk: Risk::Write,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "oid": { "type": "integer", "description": "视频 aid" },
                    "rpid": { "type": "integer", "description": "评论 id" },
                    "like": { "type": "boolean", "default": true, "description": "true 点赞，false 取消" }
                },
                "required": ["oid", "rpid"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "video_comment_post",
            title: "发表评论",
            description: "在视频下发一条评论，或回复某条评论（提供 root/parent）。内容会公开可见，需要登录。",
            risk: Risk::Costly,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "oid": { "type": "integer", "description": "视频 aid" },
                    "message": { "type": "string", "description": "评论正文" },
                    "root": { "type": "integer", "description": "回复楼中楼时的顶层评论 rpid" },
                    "parent": { "type": "integer", "description": "直接父评论 rpid" }
                },
                "required": ["oid", "message"],
                "additionalProperties": false
            })),
        },

        // ── 设置 ──────────────────────────────────────────────
        ToolSpec {
            name: "settings_get",
            title: "读取设置",
            description: "读取应用设置。可传 keys 只取指定字段；不传则返回全部（已剔除快捷键与外观大块配置）。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "keys": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "要读取的顶层字段，如 [\"sendInterval\",\"rateLimit\"]"
                    }
                },
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "settings_patch",
            title: "修改设置",
            description: "局部修改设置。只支持白名单字段：sendInterval、rateLimit、riskControl、receive、filter。\
其它字段会被忽略并在 ignored 里列出。修改外观、快捷键、窗口几何一律不支持。",
            risk: Risk::Write,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "patch": {
                        "type": "object",
                        "description": "要修改的字段，形如 {\"sendInterval\":{\"min\":1.5,\"max\":3.0}}"
                    }
                },
                "required": ["patch"],
                "additionalProperties": false
            })),
        },
    ]
}

/// 按名字查规格（供 dispatch 做权限判断）
pub fn find_spec(name: &str) -> Option<ToolSpec> {
    all_specs().into_iter().find(|spec| spec.name == name)
}

fn schema(value: serde_json::Value) -> serde_json::Value {
    value
}
