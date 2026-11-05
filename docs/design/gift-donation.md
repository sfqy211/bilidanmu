# 礼物打赏（发送礼物）设计记录

> 2026-11-06 实现。参考 cv-cat/BilibiliApis（fork: sfqy211/BilibiliApis）的
> `apis/bili_live_apis.py send_gift()`；bilibili-API-collect 刻意不收录送礼接口，
> 只有礼物列表/盲盒概率等只读文档。

## 编译期门控（2026-11-06 增补）

**官方发布默认不含此功能**——涉及真实扣费，风险归属必须清晰：

- Cargo feature `gift-send`（`src-tauri/Cargo.toml`），官方 CI 构建不带，二进制里 UI 无入口
- Rust 侧 `commands/gift.rs` 的 `ensure_enabled()`：feature 关闭时四条命令（礼物列表/背包/余额/发送）一律返回错误，防止绕过前端直接 invoke；`gift_send_enabled` 命令供前端查询能力
- 前端 DanmakuPage 按查询结果渲染：关闭时功能按钮行与 compact `+` 菜单都不出现礼物入口
- 开启方式（公开文档化，README「礼物打赏」一节）：`cargo build --features gift-send` 或把 feature 加进 default；开发调试用 `npm run dev:gift`
- 走公开可选开启而非"偷藏"：开源代码藏不住，公开写明反而更稳妥，也保护项目

## 功能概述

弹幕窗发送栏新增「礼物打赏」按钮（表情按钮旁，compact 模式收进 `+` 菜单），
打开浮层面板（复用 FloatingPanel / activePanel 机制）：

- 页签「礼物」：房间礼物面板列表，网格展示图标/名称/价格（金瓜子显示 ¥，银瓜子显示瓜子数）
- 页签「背包」：我的礼物背包，不扣费直接发送，数量档 1/10/100/全部（受持有量约束）
- 面板头部常驻瓜子余额（金瓜子显示 ¥ 金额、原始瓜子数在 hover 提示；银瓜子保留数量），发送后由前端乐观扣减刷新
- 礼物网格固定两行高度（内部滚动）；「外观设置 → 礼物图标」可关闭图标（`appearance.showGiftIcons`，默认显示，关闭后格子收缩为纯名称+价格）——该选项仅在 gift-send 构建中出现
- **金瓜子礼物（真实扣费，1000 = 1 元）发送前必须二步确认**：显示礼物×数量、
  合计金额、当前余额；银瓜子/背包礼物直接发送
- 发送成功面板保持打开（便于连送）；错误内联展示
- 匿名模式按钮禁用；真实房间拿不到主播 uid（ruid）时禁发并提示

## 接口（api.live.bilibili.com）

| 用途 | 端点 | 说明 |
| --- | --- | --- |
| 礼物面板 | GET `/xlive/web-room/v1/giftPanel/roomGiftList?platform=pc&room_id=` | 无需登录；`data.gift_config.base_config.list`。**platform 必须 pc**：传 web 时 gift_config 返回 null（2026-11-06 实测踩坑，文档参数表写的 web 是错的） |
| 背包 | GET `/xlive/web-room/v1/gift/bag_list?t={毫秒}&room_id=` | **room_id 必须真实房间号**；背包空时 `data.list` 为 null |
| 瓜子余额 | GET `/xlive/web-room/v1/index/getInfoByUser?room_id=` | `data.wallet.{gold,silver}` |
| 发送（背包） | POST `/xlive/revenue/v2/gift/sendBagMultiUser` | 走背包库存不扣费 |
| 发送（金瓜子） | POST `/xlive/revenue/v2/gift/sendGoldMultiUser` | **真实扣费** |
| 发送（银瓜子） | POST `/xlive/revenue/v2/gift/sendSilverMultiUser` | 辣条等免费礼物 |

### v2 送礼端点关键约束

- **参数全部在 query 上**（POST 无 body），content-type 仍为
  `application/x-www-form-urlencoded`；为此在 `BiliApiClient` 加了 `post_query`
  助手（区别于 `post_form` 的 body 传参）
- Header：`Referer: https://live.bilibili.com/{room_id}`、
  `Origin: https://live.bilibili.com`
- `receive_users` 必须是 JSON 数组 `[{"uid":<ruid>}]`（缺了判参数错误）
- `live_statistics` / `statistics` 为固定紧凑 JSON（pc_web 指纹字段）
- 认证仅靠 Cookie（SESSDATA + bili_jct 双 csrf 字段），**不签 WBI、不带 ticket**；
  若实测 -403，`bili/mod.rs` 已有 `sign_wbi` 可补
- 响应非 JSON（HTML 风控页）→ 中文报错「请求被拦截，可能触发风控」；
  `-101` → 提示重新登录

## 代码落点

| 层 | 文件 |
| --- | --- |
| 模型 | `src-tauri/src/models/gift.rs`（GiftConfig / GiftBagItem / WalletInfo，camelCase） |
| API | `src-tauri/src/bili/api.rs`（4 个方法 + `post_query`） |
| 命令 | `src-tauri/src/commands/gift.rs`（4 条，lib.rs generate_handler! 注册） |
| TS | `src/types/bilibili.ts`、`src/lib/tauri.ts`（gift 命名空间）、`src/hooks/useDanmaku.ts`（sendGift，不计入弹幕统计） |
| UI | `src/components/danmaku/GiftPanel.tsx`（新建）、`src/pages/DanmakuPage.tsx`（PANEL.GIFT + 按钮 + 浮层挂载，ruid 复用 `anchorId` = room.uid） |

## 安全底线

- **mock 虚拟直播间（房间号 0）四条命令全部拦截返回 fixture，绝不触网**——
  发送礼物涉及真实扣费，这是硬性约束
- 不做礼物自动连发（不接 auto_sender），每次发送显式触发
- 金瓜子每次发送都确认（用户拍板，2026-11-06）
- 发送凭据走 `get_sending_credential()`（发送账号优先，fallback 主账号），与发弹幕一致

## 边界与后续

- v1 只做完整模式；inputOnly 紧凑条送礼需仿 `set_danmaku_input_only_emotes`
  加窗口变形命令，暂缓
- 盲盒礼物按普通金瓜子礼物处理（价格已知，走确认）
- 未做连击（combo）聚合展示；SEND_GIFT/COMBO_SEND 收礼链路已存在

## 实测记录（2026-11-06，真实直播间 22924075）

- 全链路验证通过：面板加载（93 个礼物）→ 选人气票（gift_id 34102，
  100 金瓜子 = ¥0.1）→ 二步确认 → `sendGoldMultiUser` 发送成功 →
  弹幕流 SEND_GIFT 回显礼物行 + 总额累计 → 余额 32,300 → 32,200
- **余额刷新采用前端乐观扣减**（不用接口刷新）：发送成功的响应即权威
  凭证，本地按 单价×数量 直接扣减金瓜子/银瓜子/背包持有数；因为
  `getInfoByUser` 有服务端缓存（秒级延迟），发送后立即拉取会拿到旧值
  覆盖正确数，延迟拉取又要猜 TTL——乐观更新立即正确且零请求，下次
  面板打开时重新拉取自然校正漂移。实测：发送后面板内余额当场
  32,200 → 32,100，礼物总额正确累计 ¥0.20
- 风控：真实账号直发未触发 -352/-412（reqwest 指纹与 curl_cffi 不同，
  暂未遇到拦截；若日后高频送礼被拦，post_query 的非 JSON 报错会兜底提示）
- 已知边界：若礼物在活动折扣期实际扣费 ≠ 列表单价，乐观值会有临时
  偏差，重开面板（重新拉取）自愈
