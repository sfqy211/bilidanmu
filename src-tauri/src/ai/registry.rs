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
        "live_watch_start" => tools::watch::start(app, state, args).await,
        "live_watch_collect" => tools::watch::collect(app, state, args).await,
        "live_watch_digest" => tools::watch::digest(app, state, args).await,
        "live_watch_status" => tools::watch::status(app, state, args).await,
        "live_watch_stop" => tools::watch::stop(app, state, args).await,
        "live_watch_list" => tools::watch::list(app, state, args).await,
        "live_watch_senders" => tools::watch::senders(app, state, args).await,

        // ── 记忆 ──────────────────────────────────────────────
        "memory_get" => tools::memory::get(app, state, args).await,
        "memory_set" => tools::memory::set(app, state, args).await,
        "memory_append" => tools::memory::append(app, state, args).await,
        "memory_list" => tools::memory::list(app, state, args).await,
        "memory_delete" => tools::memory::delete(app, state, args).await,

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
        "auto_send_start" => tools::danmaku::auto_send_start(app, state, args).await,
        "auto_send_stop" => tools::danmaku::auto_send_stop(app, state, args).await,
        "auto_like_start" => tools::danmaku::auto_like_start(app, state, args).await,
        "auto_like_stop" => tools::danmaku::auto_like_stop(app, state, args).await,
        "auto_status" => tools::danmaku::auto_status(app, state, args).await,
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
        "video_get_danmaku" => tools::video::get_danmaku(app, state, args).await,
        "video_danmaku_send" => tools::video::send_danmaku(app, state, args).await,
        "video_fav_folders" => tools::video::fav_folders(app, state, args).await,
        "video_fav_list" => tools::video::fav_list(app, state, args).await,
        "video_watch_later" => tools::video::watch_later(app, state, args).await,
        "video_watch_later_remove" => tools::video::watch_later_remove(app, state, args).await,
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
                    "includeActivity": { "type": "boolean", "default": false, "description": "是否附带进场/点赞等轻量活动" },
                    "includeEmoticons": { "type": "boolean", "default": false, "description": "是否返回纯表情消息；默认过滤，开启后它们带 type=emoticon 标识" }
                },
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "live_query_danmaku",
            title: "检索弹幕",
            description: "检索弹幕。不带 roomId 时在当前房间已缓冲的最近 2000 条里按关键词检索（省略关键词则取最近 N 条）。\
传 roomId 时改为对该房间做一次临时只读采样：独立连接采集几秒后关闭，可读任意正在直播的房间，\
不切换当前直播间、不占用当前缓冲；只能拿到这几秒内的实时消息，直播弹幕没有历史接口。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "keyword": { "type": "string", "description": "关键词，省略则返回最近弹幕" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 300, "default": 50 },
                    "roomId": { "type": "integer", "minimum": 1, "description": "任意直播间号：传入后改为临时采样该房间（3–20 秒），不切换当前直播间" },
                    "seconds": { "type": "integer", "minimum": 3, "maximum": 60, "default": 8, "description": "roomId 模式的采样时长（秒），省略用 8；要看“播了什么”可以给 30–60" },
                    "includeEmoticons": { "type": "boolean", "default": false, "description": "是否返回纯表情消息；默认过滤，开启后带 type=emoticon 标识" }
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

        // ── 长会话（任意房间后台采集） ─────────────────────────
        ToolSpec {
            name: "live_watch_start",
            title: "开启弹幕长会话",
            description: "对任意正在直播的房间开一个后台长会话：独立连接、30 秒心跳、断线重连，
事件写入带 seq 的环形缓冲，不切换当前直播间、不开窗口。主播下播可自动结束（stopOnEnd），
保底时长默认取设置里的 4 小时（可在 AI 接入页修改，0 = 不限）。
用于「一场播几个小时，帮我总结」；只想此刻看一眼请用 live_query_danmaku。",
            risk: Risk::Write,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "roomId": { "type": "integer", "minimum": 1, "description": "直播间号" },
                    "maxMinutes": { "type": "integer", "minimum": 0, "maximum": 1440, "description": "本会话保底时长（分钟，0 = 跟随设置）；不会超过设置里的上限" },
                    "maxEvents": { "type": "integer", "minimum": 100, "maximum": 100000, "default": 20000, "description": "环形缓冲上限，超出丢弃最旧的并计入 dropped" },
                    "stopOnEnd": { "type": "boolean", "default": true, "description": "主播下播时自动结束会话（缓冲保留，仍可 collect）" },
                    "withTranscript": { "type": "boolean", "default": false, "description": "同时收集语音转字幕；仅当会话房间就是当前正在收听且开着 STT 的房间时生效" },
                    "withSenders": { "type": "boolean", "default": false, "description": "会话默认是否返回发送者；collect 每次可覆盖（热切换，不重连）" }
                },
                "required": ["roomId"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "live_watch_collect",
            title: "拉取长会话事件",
            description: "按 seq 游标增量拉取。首次 cursor=0，之后传上一次返回的 nextCursor。
默认 duplicateMode=merge：相同正文合并成 danmakuGroup（count/firstSeq/lastSeq），只出现一次的仍返回单条；
默认不带发送者（username/uid 会被移除），下次传 includeSenders=true 即可热切换，不需要重连。
emoticonMode 默认 drop（纯表情不返回）；keep 返回并标 type=emoticon / isEmoticon / emojiOnly；
aggregate 合并相同表情计数。带表情的文字仍保留，并标 inlineEmoticon。
想知道某条或某段相同弹幕是谁发的，用 live_watch_senders（seq 或 content）。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "sessionId": { "type": "string" },
                    "cursor": { "type": "integer", "minimum": 0, "default": 0, "description": "下一条要读的 seq；用上次的 nextCursor" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 1000, "default": 200 },
                    "types": { "type": "array", "items": { "type": "string", "enum": ["danmaku","gift","super_chat","guard","enter","like","live","transcript"] }, "description": "默认 [\"danmaku\",\"gift\"]，并自动带 super_chat（SC 视为特殊弹幕：只要开了弹幕或礼物就会带上）；每次调用可换，热切换不重连" },
                    "keyword": { "type": "string", "description": "按内容过滤（不区分大小写）" },
                    "duplicateMode": { "type": "string", "enum": ["merge","keep"], "default": "merge", "description": "merge 合并相同正文；keep 逐条返回" },
                    "emoticonMode": { "type": "string", "enum": ["keep","aggregate","drop"], "default": "drop", "description": "默认 drop：纯表情不返回；keep 返回并带 type=emoticon 标识；aggregate 合并计数" },
                    "includeSenders": { "type": "boolean", "description": "本次是否带发送者；省略跟随会话 withSenders。热切换，不重连" },
                    "senderLimit": { "type": "integer", "minimum": 1, "maximum": 200, "default": 20 }
                },
                "required": ["sessionId"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "live_watch_digest",
            title: "长会话统计摘要",
            description: "只取统计不取正文：类型分布、独立用户、TOP 发言者、表情聚合、礼物/SC 汇总、每分钟弹幕量。
总结长会话前先调它看热度与表情分布，再按需 collect 正文。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "sessionId": { "type": "string" },
                    "topN": { "type": "integer", "minimum": 1, "maximum": 50, "default": 10 },
                    "includeSenders": { "type": "boolean", "default": false, "description": "表情聚合是否附发送者明细" },
                    "senderLimit": { "type": "integer", "minimum": 1, "maximum": 50, "default": 5 }
                },
                "required": ["sessionId"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "live_watch_status",
            title: "长会话状态",
            description: "会话健康度：已收/丢弃条数、缓冲占用、连接状态、重连次数、结束原因。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": { "sessionId": { "type": "string" } },
                "required": ["sessionId"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "live_watch_stop",
            title: "停止长会话",
            description: "停止采集。默认保留缓冲供继续 collect；remove=true 时连缓冲一起丢弃。",
            risk: Risk::Write,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "sessionId": { "type": "string" },
                    "remove": { "type": "boolean", "default": false }
                },
                "required": ["sessionId"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "live_watch_list",
            title: "长会话列表",
            description: "列出全部会话（含已结束、仍在保留期内的），含缓冲与连接状态。",
            risk: Risk::Read,
            input_schema: schema(json!({ "type": "object", "properties": {}, "additionalProperties": false })),
        },

        ToolSpec {
            name: "live_watch_senders",
            title: "查询弹幕发送者",
            description: "默认返回不带发送者；需要时用 seq（单条）或 content（某段相同弹幕）查发送者。\n\
可配 fromSeq/toSeq 缩小范围。返回每个发送者的次数与首末时间，以及最多 10 条样本。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "sessionId": { "type": "string" },
                    "seq": { "type": "integer", "minimum": 1, "description": "单条事件的 seq（collect 的 events/merged 里有）" },
                    "content": { "type": "string", "description": "相同弹幕的正文（精确匹配）" },
                    "fromSeq": { "type": "integer", "minimum": 0, "description": "配合 content 缩小范围" },
                    "toSeq": { "type": "integer", "minimum": 0 }
                },
                "required": ["sessionId"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "memory_get",
            title: "读取记忆",
            description: "读取房间或全局记忆的完整内容。scope=room 时 roomId 用真实房间号（room_get 返回值）。\n\
watch_start 已自动附带房间摘要，需要完整内容时再用它。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "scope": { "type": "string", "enum": ["room", "global"] },
                    "roomId": { "type": "integer", "minimum": 1, "description": "scope=room 时必填（真实房间号）" }
                },
                "required": ["scope"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "memory_set",
            title: "覆盖记忆",
            description: "覆盖写入某个范围的记忆（Markdown，最多 8000 字）。清空请用 memory_delete。\n\
适合在总结一整场直播后，把过时内容整体替换掉。",
            risk: Risk::Write,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "scope": { "type": "string", "enum": ["room", "global"] },
                    "roomId": { "type": "integer", "minimum": 1 },
                    "content": { "type": "string", "description": "Markdown 正文，最多 8000 字" }
                },
                "required": ["scope", "content"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "memory_append",
            title: "追加记忆",
            description: "在已有记忆后追加一段（空行分隔）。适合记录「这场直播新增的事实」，不覆盖旧内容。",
            risk: Risk::Write,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "scope": { "type": "string", "enum": ["room", "global"] },
                    "roomId": { "type": "integer", "minimum": 1 },
                    "content": { "type": "string", "description": "要追加的 Markdown 片段" }
                },
                "required": ["scope", "content"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "memory_list",
            title: "记忆列表",
            description: "列出全部房间/全局记忆的摘要（字数、更新时间、前 80 字）。",
            risk: Risk::Read,
            input_schema: schema(json!({ "type": "object", "properties": {}, "additionalProperties": false })),
        },
        ToolSpec {
            name: "memory_delete",
            title: "删除记忆",
            description: "删除某个范围的记忆。不可逆。",
            risk: Risk::Destructive,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "scope": { "type": "string", "enum": ["room", "global"] },
                    "roomId": { "type": "integer", "minimum": 1 }
                },
                "required": ["scope"],
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
            name: "auto_send_start",
            title: "启动循环发送弹幕",
            description: "在后台按固定间隔循环发送 entries 里的文案（桌面端「自动发送」同一个后台任务）。\
一次确认覆盖整段循环，节奏由 Rust 定时器控制，不依赖模型往返。intervalMs 会被抬到用户设置的最小发送间隔。\
文字弹幕每条不超过 20 字，entries 按顺序轮播；用 auto_send_stop 停止，auto_status 查看状态。",
            risk: Risk::Costly,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "roomId": { "type": "integer", "description": "房间号，省略则用当前直播间" },
                    "entries": {
                        "type": "array",
                        "description": "循环条目，最多 20 条，按顺序轮播",
                        "items": {
                            "type": "object",
                            "properties": {
                                "message": { "type": "string", "description": "文字弹幕正文（≤20 字），或表情的 emoticonUnique" },
                                "dmType": { "type": "integer", "enum": [0, 1], "description": "0=文字，1=表情" },
                                "emoticonOptions": { "type": "string", "description": "dmType=1 时的 emoticon_options JSON，省略按 emoticonUnique 兜底" }
                            },
                            "required": ["message"],
                            "additionalProperties": false
                        }
                    },
                    "intervalMs": { "type": "integer", "minimum": 300, "description": "发送间隔毫秒，默认 3000；不会低于用户设置的最小发送间隔" },
                    "timeLimitSecs": { "type": "integer", "minimum": 1, "description": "可选：运行多少秒后自动停止；省略则持续到手动停止" }
                },
                "required": ["entries"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "auto_send_stop",
            title: "停止循环发送弹幕",
            description: "停止正在运行的循环发送任务。",
            risk: Risk::Write,
            input_schema: schema(json!({ "type": "object", "properties": {}, "additionalProperties": false })),
        },
        ToolSpec {
            name: "auto_like_start",
            title: "启动自动点赞",
            description: "分批给直播间点赞直到 targetTotal，到量自动停止（桌面端「自动点赞」同一个后台任务）。\
batchSize 为每批次数，intervalMs 为批次间隔。",
            risk: Risk::Write,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "roomId": { "type": "integer", "description": "房间号，省略则用当前直播间" },
                    "anchorId": { "type": "integer", "description": "主播 uid，省略则从已保存房间读取" },
                    "targetTotal": { "type": "integer", "minimum": 1, "maximum": 1000, "default": 100 },
                    "batchSize": { "type": "integer", "minimum": 1, "maximum": 100, "default": 20 },
                    "intervalMs": { "type": "integer", "minimum": 500, "default": 5000, "description": "每批之间的间隔毫秒" }
                },
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "auto_like_stop",
            title: "停止自动点赞",
            description: "停止正在运行的自动点赞任务。",
            risk: Risk::Write,
            input_schema: schema(json!({ "type": "object", "properties": {}, "additionalProperties": false })),
        },
        ToolSpec {
            name: "auto_status",
            title: "自动任务状态",
            description: "循环发送与自动点赞是否还在后台运行。",
            risk: Risk::Read,
            input_schema: schema(json!({ "type": "object", "properties": {}, "additionalProperties": false })),
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
            name: "video_get_danmaku",
            title: "视频弹幕",
            description: "拉取视频内某一时段的弹幕。B 站按 6 分钟分段（segment 从 1 开始），长视频按 video_get_info 的总时长除以 360 逐段翻页。不传 cid 时自动取第一个分P。",
            risk: Risk::Read,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "bvid": { "type": "string" },
                    "cid": { "type": "integer", "description": "分P id，省略取第一个分P" },
                    "segment": { "type": "integer", "minimum": 1, "maximum": 10000, "default": 1, "description": "6 分钟一段，从 1 开始" }
                },
                "required": ["bvid"],
                "additionalProperties": false
            })),
        },
        ToolSpec {
            name: "video_danmaku_send",
            title: "发送视频弹幕",
            description: "在视频的指定时间点发送一条弹幕。弹幕公开可见，必须已登录；长度上限 100 字；20 秒内相同文案会被拒绝。",
            risk: Risk::Costly,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "bvid": { "type": "string" },
                    "message": { "type": "string", "description": "弹幕正文（1–100 字）" },
                    "progress": { "type": "number", "minimum": 0, "description": "视频内时间（秒）" },
                    "cid": { "type": "integer", "description": "分P id，省略取第一个分P" }
                },
                "required": ["bvid", "message", "progress"],
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
            name: "video_watch_later_remove",
            title: "从稍后再看移除",
            description: "把一个视频从稍后再看列表里删掉。需要登录。aid 来自 video_watch_later（不是 bvid）；删除会同步到 B 站账号。",
            risk: Risk::Write,
            input_schema: schema(json!({
                "type": "object",
                "properties": {
                    "aid": { "type": "integer", "minimum": 1, "description": "视频 aid，来自 video_watch_later 的返回" }
                },
                "required": ["aid"],
                "additionalProperties": false
            })),
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

/// 对外暴露的域工具：57 个内部工具折叠成 8 个域 + mcp_describe。
///
/// 内部规格仍是单一真源；这里只决定“模型看到什么”。调用时代理层会把
/// `{action, params}` 还原成内部工具名，权限、审计与确认流程仍按真实 action 走。
pub struct DomainSpec {
    pub name: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    /// (对外的 action 名, 内部工具名)
    pub actions: &'static [(&'static str, &'static str)],
}

pub const DOMAINS: &[DomainSpec] = &[
    DomainSpec {
        name: "app",
        title: "应用与窗口",
        description: "应用状态与窗口控制。action: status（登录态/当前房间/权限/MCP/礼物可用性）、refresh_rooms、reveal_window、permission（读取 AI 权限模式）。参数放 params。",
        actions: &[
            ("status", "app_get_status"),
            ("refresh_rooms", "app_refresh_rooms"),
            ("reveal_window", "app_reveal_window"),
            ("permission", "app_get_permission"),
        ],
    },
    DomainSpec {
        name: "live",
        title: "直播间",
        description: "直播间上下文与长会话。action: get_context（房间全貌，首选）、query_danmaku（当前房间检索；带 roomId 做短采样）、get_stats、watch_start / watch_collect / watch_digest / watch_status / watch_stop / watch_list / watch_senders（后台长会话；collect 默认合并重复且不带发送者，按需用 watch_senders 查）。",
        actions: &[
            ("get_context", "live_get_context"),
            ("query_danmaku", "live_query_danmaku"),
            ("get_stats", "live_get_stats"),
            ("watch_start", "live_watch_start"),
            ("watch_collect", "live_watch_collect"),
            ("watch_digest", "live_watch_digest"),
            ("watch_status", "live_watch_status"),
            ("watch_stop", "live_watch_stop"),
            ("watch_list", "live_watch_list"),
            ("watch_senders", "live_watch_senders"),
        ],
    },
    DomainSpec {
        name: "room",
        title: "房间管理",
        description: "已保存房间与目标房间操作。action: list、search、get、live_status、follow_lives、join、leave。",
        actions: &[
            ("list", "room_list"),
            ("search", "room_search"),
            ("get", "room_get"),
            ("live_status", "room_live_status"),
            ("follow_lives", "room_follow_lives"),
            ("join", "room_join"),
            ("leave", "room_leave"),
        ],
    },
    DomainSpec {
        name: "danmaku",
        title: "弹幕与自动化",
        description: "发送、点赞、自动发送与模板。action: get_emoticons、send、send_emoticon、like、auto_send_start、auto_send_stop、auto_like_start、auto_like_stop、auto_status、template_list、template_save、template_delete。",
        actions: &[
            ("get_emoticons", "danmaku_get_emoticons"),
            ("send", "danmaku_send"),
            ("send_emoticon", "danmaku_send_emoticon"),
            ("like", "danmaku_like"),
            ("auto_send_start", "auto_send_start"),
            ("auto_send_stop", "auto_send_stop"),
            ("auto_like_start", "auto_like_start"),
            ("auto_like_stop", "auto_like_stop"),
            ("auto_status", "auto_status"),
            ("template_list", "template_list"),
            ("template_save", "template_save"),
            ("template_delete", "template_delete"),
        ],
    },
    DomainSpec {
        name: "gift",
        title: "礼物",
        description: "礼物面板、背包与赠送。action: list、bag、send（真实扣费，需确认）。",
        actions: &[
            ("list", "gift_list"),
            ("bag", "gift_bag"),
            ("send", "gift_send"),
        ],
    },
    DomainSpec {
        name: "video",
        title: "视频",
        description: "视频查询、播放、评论、收藏夹与稍后再看。action: search、get_info、get_subtitle、get_danmaku、danmaku_send、get_comments、get_replies、fav_folders、fav_list、watch_later、watch_later_remove、play、stop、comment_like、comment_post。",
        actions: &[
            ("search", "video_search"),
            ("get_info", "video_get_info"),
            ("get_subtitle", "video_get_subtitle"),
            ("get_danmaku", "video_get_danmaku"),
            ("danmaku_send", "video_danmaku_send"),
            ("get_comments", "video_get_comments"),
            ("get_replies", "video_get_replies"),
            ("fav_folders", "video_fav_folders"),
            ("fav_list", "video_fav_list"),
            ("watch_later", "video_watch_later"),
            ("watch_later_remove", "video_watch_later_remove"),
            ("play", "video_play"),
            ("stop", "video_stop"),
            ("comment_like", "video_comment_like"),
            ("comment_post", "video_comment_post"),
        ],
    },
    DomainSpec {
        name: "account",
        title: "账号",
        description: "账号列表、当前登录态与钱包。action: list、get_current、get_wallet、switch、remove（删除本地凭据，不可逆）。",
        actions: &[
            ("list", "account_list"),
            ("get_current", "account_get_current"),
            ("get_wallet", "account_get_wallet"),
            ("switch", "account_switch"),
            ("remove", "account_remove"),
        ],
    },
    DomainSpec {
        name: "settings",
        title: "设置",
        description: "读取与按白名单修改设置。action: get、patch。",
        actions: &[
            ("get", "settings_get"),
            ("patch", "settings_patch"),
        ],
    },
    DomainSpec {
        name: "memory",
        title: "直播记忆",
        description: "房间 / 全局两级 Markdown 记忆。action: get、set（覆盖）、append、list、delete（不可逆）。\
房间记忆用真实房间号；总量每个范围 8000 字。",
        actions: &[
            ("get", "memory_get"),
            ("set", "memory_set"),
            ("append", "memory_append"),
            ("list", "memory_list"),
            ("delete", "memory_delete"),
        ],
    },
];

/// 按名字查域
pub fn find_domain(name: &str) -> Option<&'static DomainSpec> {
    DOMAINS.iter().find(|domain| domain.name == name)
}

/// 域内 action → 内部工具名
pub fn resolve_action(domain: &str, action: &str) -> Option<&'static str> {
    find_domain(domain)?
        .actions
        .iter()
        .find(|(candidate, _)| *candidate == action)
        .map(|(_, tool)| *tool)
}

/// 把一次对外调用还原成内部工具名 + 参数。
///
/// 非域工具原样返回；域工具取 `action` 与 `params`。
pub fn resolve_call(
    name: &str,
    args: &serde_json::Value,
) -> Result<(String, serde_json::Value, String), ToolError> {
    let Some(domain) = find_domain(name) else {
        return Ok((name.to_string(), args.clone(), name.to_string()));
    };
    let action = args
        .get("action")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| {
            ToolError::invalid_args(format!("{name} 缺少 action"))
                .with_hint(format!("调 mcp_describe(domain=\"{name}\") 查看可用 action"))
        })?;
    let tool = resolve_action(domain.name, action).ok_or_else(|| {
        ToolError::invalid_args(format!("{name} 没有 action \"{action}\""))
            .with_hint(format!("调 mcp_describe(domain=\"{name}\") 查看可用 action"))
    })?;
    let params = match args.get("params") {
        None | Some(serde_json::Value::Null) => json!({}),
        Some(serde_json::Value::Object(_)) => args["params"].clone(),
        Some(_) => return Err(ToolError::invalid_args("params 需要是对象")),
    };
    Ok((
        tool.to_string(),
        params,
        format!("{}.{}", domain.name, action),
    ))
}

/// 目录查询（mcp_describe）。
///
/// - 无 domain：返回域与 action 索引
/// - 有 domain：返回该域所有 action 的说明与参数 schema
/// - domain + action：只返回这一个
pub fn describe(domain: Option<&str>, action: Option<&str>) -> Result<serde_json::Value, ToolError> {
    let Some(domain_name) = domain else {
        let domains: Vec<serde_json::Value> = DOMAINS
            .iter()
            .map(|domain| {
                json!({
                    "domain": domain.name,
                    "title": domain.title,
                    "actions": domain.actions.iter().map(|(action, _)| *action).collect::<Vec<_>>(),
                })
            })
            .collect();
        return Ok(json!({
            "domains": domains,
            "hint": "调 mcp_describe(domain=\"video\") 查看参数；不确定参数时先查再调"
        }));
    };

    let spec = find_domain(domain_name).ok_or_else(|| {
        ToolError::invalid_args(format!("未知域 {domain_name}")).with_hint("不传 domain 可看全部域")
    })?;

    let to_entry = |action_name: &str, tool: &str| -> serde_json::Value {
        match find_spec(tool) {
            Some(spec) => json!({
                "action": action_name,
                "title": spec.title,
                "description": spec.description,
                "risk": spec.risk.as_str(),
                "parameters": spec.input_schema,
            }),
            None => json!({ "action": action_name }),
        }
    };

    if let Some(action_name) = action {
        let tool = resolve_action(domain_name, action_name).ok_or_else(|| {
            ToolError::invalid_args(format!("{domain_name} 没有 action \"{action_name}\""))
                .with_hint(format!("调 mcp_describe(domain=\"{domain_name}\") 查看可用 action"))
        })?;
        return Ok(json!({
            "domain": domain_name,
            "action": to_entry(action_name, tool),
        }));
    }

    let actions: Vec<serde_json::Value> = spec
        .actions
        .iter()
        .map(|(action_name, tool)| to_entry(action_name, tool))
        .collect();
    Ok(json!({ "domain": domain_name, "title": spec.title, "actions": actions }))
}

/// MCP `tools/list` 的返回：8 个域 + mcp_describe。
pub fn exposed_tools() -> Vec<serde_json::Value> {
    let mut tools: Vec<serde_json::Value> = DOMAINS
        .iter()
        .map(|domain| {
            let actions: Vec<&str> = domain
                .actions
                .iter()
                .map(|(action, _)| *action)
                .collect();
            json!({
                "name": domain.name,
                "title": domain.title,
                "description": domain.description,
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "action": { "type": "string", "enum": actions },
                        "params": { "type": "object", "description": "该 action 的参数对象；不确定字段时先调 mcp_describe", "additionalProperties": true }
                    },
                    "required": ["action"],
                    "additionalProperties": false
                },
                "annotations": { "readOnlyHint": false, "destructiveHint": false }
            })
        })
        .collect();
    tools.push(json!({
        "name": "mcp_describe",
        "title": "查询工具参数",
        "description": "按域/action 返回完整参数 schema 与风险等级；不带参数返回全部域与 action 索引。参数不确定时先查它，避免猜错字段。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "domain": { "type": "string", "enum": DOMAINS.iter().map(|domain| domain.name).collect::<Vec<_>>() },
                "action": { "type": "string", "description": "域内 action 名，省略返回整个域" }
            },
            "additionalProperties": false
        },
        "annotations": { "readOnlyHint": true, "destructiveHint": false }
    }));
    tools
}

/// 按名字查规格（供 dispatch 做权限判断）
pub fn find_spec(name: &str) -> Option<ToolSpec> {
    all_specs().into_iter().find(|spec| spec.name == name)
}

fn schema(value: serde_json::Value) -> serde_json::Value {
    value
}


#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn every_internal_tool_is_exposed_exactly_once() {
        let specs = all_specs();
        let internals: HashSet<&'static str> = specs.iter().map(|spec| spec.name).collect();
        let mut exposed: HashSet<&'static str> = HashSet::new();
        for domain in DOMAINS {
            for (action, tool) in domain.actions {
                assert!(
                    internals.contains(tool),
                    "域 {} 的 action {} 指向不存在的工具 {}",
                    domain.name,
                    action,
                    tool
                );
                assert!(exposed.insert(*tool), "工具 {tool} 被重复暴露");
            }
        }
        assert_eq!(exposed, internals, "存在内部工具没有挂到任何域");
    }

    #[test]
    fn action_names_resolve_uniquely() {
        for domain in DOMAINS {
            let mut seen = HashSet::new();
            for (action, tool) in domain.actions {
                assert!(seen.insert(*action), "域 {} 的 action {} 重复", domain.name, action);
                assert_eq!(resolve_action(domain.name, action), Some(*tool));
            }
        }
        assert!(resolve_action("live", "not_exists").is_none());
        assert!(find_domain("nope").is_none());
    }

    #[test]
    fn exposed_catalog_stays_small() {
        let tools = exposed_tools();
        assert_eq!(tools.len(), DOMAINS.len() + 1);
        let chars: usize = tools.iter().map(|tool| tool.to_string().chars().count()).sum();
        assert!(chars < 6000, "工具目录过大：{chars} 字符");
    }

    #[test]
    fn describe_returns_full_spec_on_demand() {
        let domain = describe(Some("video"), None).expect("describe domain");
        let actions = domain["actions"].as_array().expect("actions");
        let subtitle = actions
            .iter()
            .find(|entry| entry["action"] == "get_subtitle")
            .expect("get_subtitle");
        assert!(subtitle["parameters"]["properties"]["bvid"].is_object());

        let single = describe(Some("live"), Some("query_danmaku")).expect("describe action");
        assert_eq!(single["action"]["action"], "query_danmaku");
        assert!(single["action"]["parameters"].is_object());
        assert!(describe(Some("live"), Some("nope")).is_err());

        // 域调用必须解析回真实 action 的风险等级（权限闸门依赖它）
        let costly = describe(Some("video"), Some("danmaku_send")).expect("costly action");
        assert_eq!(costly["action"]["risk"], "costly");
        let destructive = describe(Some("account"), Some("remove")).expect("destructive action");
        assert_eq!(destructive["action"]["risk"], "destructive");
    }
}
