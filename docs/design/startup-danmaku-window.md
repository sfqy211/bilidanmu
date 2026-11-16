# 启动即弹幕窗口（startup_view）设计记录

> 2026-11-16 实现。把产品核心从「主页面 → 进直播间开弹幕窗」调整为「启动直接是弹幕窗口」，
> 退出弹幕窗（右上角）回到主页面。原流程仍可通过设置切换回来。

## 需求与决策

- 启动后直接显示弹幕窗口，右上角退出后才显示主页面（弹幕与主页面互斥的既有语义不变）
- 新增设置项 `startupView: "danmaku" | "main"`（通用页「启动时显示」），**默认 danmaku**
- **未添加任何直播间时启动直接打开主页面**（2026-11-16 增补：空列表下弹幕引导页没有意义，
  回主页添加更顺手）
- 上次观看的直播间（selections `currentRoomId`）仍在房间列表中时，启动直接恢复进入该直播间；
  没有记录或房间已移除时打开默认引导页
- 引导页内容：已保存直播间列表（开播中的排最前、带状态点与直播标题），点击经 `switch_room` 进入；
  空列表时显示「还没有添加直播间」+ 打开主页面按钮
- 静默启动（`silent_start`）优先级最高：开启时不弹任何窗口，只驻留托盘（行为不变）

## 实现要点

### Rust

- `Settings.startup_view`（`models/settings.rs`，serde default `"danmaku"`，旧库无该键自动取默认）
- `create_danmaku_window` 签名改为 `room_id: Option<u64>`：None → 路由 `/danmaku`（默认页）、
  标题「弹幕窗口」；**无房间时强制完整模式**（忽略持久化的 input_only）——引导页是选择直播间的
  取景器，紧凑栏放不下；恢复直播间路径保留用户的紧凑模式偏好
- 新命令 `open_danmaku_home`：创建/显示默认页（窗口已存在时仅显示，不打断当前直播间）
- 新命令 `close_danmaku_window`：默认页右上角退出路径——销毁弹幕窗并显示主页面；
  与 `exit_room` 不同，**不动 currentRoomId**（下次启动仍可恢复）
- `startup_open_danmaku_window`（非命令，setup 后台 spawn 调用）：**房间列表为空直接显示主页面** →
  读 currentRoomId → 校验房间仍在 → `open_danmaku_window`（恢复）或 `open_danmaku_home`（引导页）；
  创建失败回退显示主窗口，避免启动后一个窗口都看不见
- `lib.rs` setup：非静默且 `startup_view == "danmaku"` 时主窗口保持隐藏，spawn 上述流程；
  否则走原主窗口显示逻辑。设置只读一次（原实现读了三次）

### 前端

- 新路由 `/danmaku` → `pages/DanmakuDefaultPage.tsx`（懒加载）；`/danmaku/:roomId` 不变
- DanmakuDefaultPage：复用弹幕窗视觉体系（`danmaku-bg-main window-rounded` / `--bg-a` 不透明度）、
  标题栏 mousedown 拖动、隐藏到托盘（X）与回到主页面（LogOut）双按钮；
  监听 `room-switched` 切路由——**必须由本页自己监听**，DanmakuPage 的同名监听只挂在房间路由上，
  托盘「房间：X」菜单在引导页显示时触发 `switch_room` 才不会丢跳转
- 开播状态用 `getRoomsLiveStatus()`（按 UID 键控），挂载拉一次 + 跟随 `rooms-updated`（60s 轮询）刷新
- 设置类型/默认值/通用页 UI（SettingsChoice）/重置 keys 同步补齐

## 兼容性

- 托盘左键、单实例二次启动、快捷键 toggle 均走 `current_window()`（弹幕窗优先，回退主窗），无需改动
- `exit_room`（直播间内右上角退出）语义不变：销毁窗口 → 显示主页面 → currentRoomId 保留 →
  下次启动恢复该直播间
- 直播间内的「隐藏到托盘」（X）行为不变；引导页的 X 同样只隐藏到托盘

## 代码落点

| 层 | 文件 |
| --- | --- |
| 设置模型 | `src-tauri/src/models/settings.rs` |
| 窗口命令 | `src-tauri/src/commands/room.rs`（create_danmaku_window / open_danmaku_home / close_danmaku_window / startup_open_danmaku_window） |
| 启动流程 | `src-tauri/src/lib.rs`（setup 静默/弹幕窗/主窗口三分支） |
| 默认页 | `src/pages/DanmakuDefaultPage.tsx`、`src/router.tsx` |
| 设置 UI | `src/components/settings/GeneralSettings.tsx`、`src/pages/SettingsPage.tsx`、`src/types/bilibili.ts`、`src/stores/settings-store.ts`、`src/lib/tauri.ts` |
