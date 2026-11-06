# AGENTS.md

## Use these commands
- Install deps: `npm ci`.
- Full desktop dev: `npm run dev`.
- Mock live room dev: `npm run dev:mock` (see Testing).
- Gift-enabled dev: `npm run dev:gift`.
- Frontend-only dev: `npm run dev:renderer`.
- Frontend verification: `npm run typecheck`.
- Rust verification: `cargo check` from `src-tauri/`.
- Build release: `npm run build` (gift build: `npm run build:gift`).
- Docs site verification: `npm run build` from `docs/` (Docusaurus).
- After changing `src-tauri/icons/`: `touch src-tauri/build.rs` before rebuilding (cargo fingerprints don't watch icon files, so the embedded icon stays stale), then `ie4uinit.exe -show` to flush the Windows taskbar icon cache.
- Version bump: `.\scripts\bump-version.ps1 <version>` (also rewrites `RELEASE_VERSION` in `docs/src/components/landing/LandingApp.tsx`; keep that in sync or the homepage download links 404).
- No lite build variant — STT is always compiled in, toggled at runtime via settings. There is no built-in LLM: `src/pages/AIPage.tsx` is the MCP management page (service status/token, 三档权限, tool list, audit log, debug panel). AI capability lives in external MCP clients, not in this app.
- 礼物打赏（发送礼物）由 cargo feature `gift-send` 门控，官方构建默认关闭：命令层 `ensure_enabled()` 硬校验 + 前端按 `gift_send_enabled` 隐藏入口；开发调试用 `npm run dev:gift`。
- There is no configured JS test/lint task in `package.json`; do not claim tests/lint passed unless you actually ran the available checks above.

## Required verification after code changes
- Default expectation: run `npm run typecheck` and `cargo check`.
- If you touched STT code, verify it still compiles.
- If you touched `docs/`, run `npm run build` in `docs/` — `onBrokenLinks: 'throw'` fails the build on dead internal links.

## Testing
- `tests/README.md` is the testing handbook — read it before driving any manual or scripted test; put new test scripts in `tests/`.
- `npm run dev:mock` starts the app with the mock virtual live room (env `BILIDANMU_MOCK=1`): local danmaku server on `127.0.0.1:23330` speaking the real bilibili binary protocol, HTTP control plane on `127.0.0.1:23331` (curl-driven scenarios: rates, live/preparing, kick, burst, delay, single-event injection), reserved room id `0` shows a "测试直播间（虚拟）" card in the room list. Without the env var the same binary is fully unaffected.
- `cargo test --lib bili::mock` (in `src-tauri/`) runs the mock end-to-end regression test; it binds ports 23330/23331, so close any running `dev:mock` instance first.
- Mock-room limitations are intentional: no audio/STT (no real stream), sending danmaku/emoticons/gifts and emoticon fetching are skipped (avoid touching real rooms).

## Release flow (CI)
- `.github/workflows/publish-tauri.yml`: pushing to `main` with a change to `src-tauri/tauri.conf.json` publishes a GitHub release tagged `app-v<version>` (skipped if the tag already exists). Treat version bumps as release triggers. Matrix: Windows x64, macOS universal, Linux x64 (Ubuntu 22.04).
- Release changelog is parsed from conventional commit subjects (`feat:` / `fix:` / `refactor:`); anything else lands in "其他".
- CI gates on `npm run typecheck` and `cargo check` (in `src-tauri/`) before building, and deletes `src-tauri/target/sherpa-onnx-prebuilt` first (rust-cache leaves empty dirs that defeat sherpa-onnx-sys's "download if dir exists" check).
- `.github/workflows/deploy-docs.yml`: pushing to `main` with changes under `docs/**` builds the Docusaurus site and deploys it to GitHub Pages.

## Repo shape
- `src/` is the Vite/React frontend. Vite root is `src`, output is `dist`, dev server is fixed to `http://localhost:3000` (`strictPort: true`, so a busy port fails instead of shifting).
- `src-tauri/` is the Tauri/Rust app. `tauri.conf.json` starts the renderer with `beforeDevCommand: npm run dev:renderer` and builds it with `beforeBuildCommand: npm run build:renderer`.
- Path alias `@/*` points to `src/*`.
- 本地参考项目在 `D:\AHEU\code\reference`（bilibili-API-collect 协议文档、live-moyu 悬浮输入框/紧凑窗、JLiverTool 协议解析/SEND_GIFT_V2、BilibiliApis 送礼接口等）；遇到协议或接口问题先查本地参考项目，再联网搜索。
- `docs/` is the Docusaurus documentation site (`routeBasePath: '/'`, content in `docs/docs/`, homepage/landing in `docs/src/`). Run `npm run dev` in `docs/` to start the docs dev server. `docs/design/` holds per-feature design records (that directory is NOT part of the docs site).

## Routes and navigation
- `src/router.tsx`: `/rooms`, `/rooms/add`, `/accounts`, `/ai`, `/settings`, `/listen`, `/listen/add` (`/listen/search` redirects to it), `/listen/watchlater`, `/listen/fav/:mediaId`, `/listen/video/:bvid`, `/listen/video/:bvid/comments`, plus the standalone `/danmaku/:roomId` window route.
- There is no "看直播 / 听视频" mode switch. Main-window navigation is the sidebar only: 直播间 / 账号 / AI 接入 / 听视频, with 设置 pinned at the bottom (`AppSidebar.tsx` → `WorkspaceSidebar.tsx`). Write docs against these exact labels.
- `AppLayout` supplies the sidebar; `WorkspaceLayout` owns the title bar, resizable sidebar, page area and the listen mini player.

## Architecture facts that affect edits
- Frontend boots from `src/main.tsx` (restores settings, view mode, sidebar width before first paint) with React Router + Zustand; `src/App.tsx` then restores login, settings, rooms, favorites and the saved room, and listens for `room-switched`, `rooms-updated`, `account-switched`, `settings-changed`, `danmaku-entered`, `room-exited`. Event listeners that only make sense in the main window are gated on `getCurrentWindow().label === "main"`.
- All frontend-to-Rust IPC goes through `src/lib/tauri.ts` (`tauriCommands` namespaces). When adding a new Tauri command, add the TS wrapper there instead of calling `invoke()` ad hoc.
- Rust commands are registered centrally in `src-tauri/src/lib.rs` via `tauri::generate_handler!`. New commands must be added there. (`commands::room::refresh_all_rooms` carries `#[tauri::command]` but is only called from `setup()`, not registered.)
- Window permissions must be declared in `src-tauri/capabilities/default.json` (e.g., `core:window:allow-start-dragging`, `core:window:allow-set-always-on-top`). The capability applies to windows `main` + `danmaku`.
- All windows use `decorations: false` — custom title bars. The main window is 960×680 (min 800×600, `transparent: true` + `shadow: false`, `visible: false` until setup decides); there is a single persistent danmaku window with fixed label `danmaku`, created at runtime in `commands/room.rs` (`create_danmaku_window`) with `.transparent(true)` for opacity support, dock attachment, and no taskbar entry. It is never destroyed on room switch.
- No `drawer-*` windows are created anywhere; `close_drawer_windows` / the `exit_room` prefix cleanup are remnants — don't document drawer windows as a feature.
- Fast room switching: `switch_room` (used by tray room menu and the danmaku-window RoomSwitcher popover) switches rooms in place inside the persistent window — it saves `currentRoomId`, refreshes the tray, closes the old room's drawer windows, updates the window title, and emits `room-switched`; the danmaku window listens for that event and navigates to `/danmaku/{room_id}` in place. Visibility is preserved (hidden stays hidden; visible stays visible without stealing focus). `open_danmaku_window` (RoomPage's enter-room path) shares the bookkeeping but additionally shows + focuses the window and hides the main window, and emits `danmaku-entered` to `main`.
- Both the tray room submenu and the RoomSwitcher popover list only currently-live rooms. Live status is cached in `AppState.live_status` by a 60s poll (`refresh_live_status_cache`, spawned in lib.rs setup); until the first successful fetch the tray falls back to listing all saved rooms. The popover fetches fresh status on open and shows a loading/empty hint. The status map is keyed by **UID** (from `get_status_info_by_uids`), not room id — always match via `room.uid` / `r.uid`.
- Danmaku window close hides to tray (not disconnect). Separate exit button for actual disconnect.
- Tray single-click toggles the current window's visibility only (never swaps windows): the current window is the danmaku window while a room is connected (the `danmaku` window exists, even if hidden), otherwise the main window. Danmaku and main windows are mutually exclusive — entering a room hides the main window, and `exit_room` (a real disconnect, via the danmaku window's exit button) immediately restores it; hiding the danmaku window to tray is display-only, not a disconnect. The tray left-click handler fires only on `button_state == Up` (a physical click emits both Down and Up `Click` events). There is no tray menu item for switching/summoning windows.
- Danmaku title-bar buttons (order): 置顶 / 锁定 / 仅输入框 / 窗口透传 / 隐身 / 隐藏到托盘 / 房间切换 / 退出直播间. Every button except 退出直播间 can be hidden via `appearance.titleBarButtons`; the settings grid lists them in a slightly different order — don't treat that as a bug.
- Danmaku window modes are Rust-driven where geometry/topmost/hit-testing matter: `set_danmaku_input_only` (240–520 × 48 logical, bottom-edge anchored, dock-exclusive), `set_danmaku_input_only_emotes` (temporary 360×400 panel), `set_danmaku_stealth`, dock commands (`dock_expand` / `dock_apply_expand` / `dock_collapse` / `dock_exit` / `get_dock_state`). Frontend only switches rendering shape and listens to `danmaku-input-only`, `danmaku-input-only-emotes`, `danmaku-stealth`, `dock-changed`.
- Video audio and live audio are mutually exclusive: entering a room emits `danmaku-entered`, which pauses the video player (queue and progress are kept; the mini player resumes it manually).
- Dual credential: `state.credential` (main, for WS/audio) + `state.sending_credential` (for sending danmaku/emoticons/gifts). `get_sending_credential()` helper in `commands/mod.rs` falls back to main.
- STT is always compiled in (no feature gates); `is_stt_available` always returns true and runtime toggles via settings control whether it's active.

## AI tool layer / MCP server

- `src-tauri/src/ai/` is the tool layer; `src-tauri/src/mcp/` is the local MCP server. They do NOT duplicate business logic — write tools call the same `#[tauri::command]` fns (`app.state::<AppState>()` supplies the `State`), so AI actions and UI actions share one code path (tray refresh, window exclusivity, routing included).
- **Single dispatch entry**: `ai::dispatch::call_tool(app, &AppState, name, args, origin)` is the only place that runs a tool. Both the MCP handler and the AIPage debug panel go through it — permission gate, rate limiting and audit cannot be bypassed by adding a new caller.
- Three permission modes (`aiPermissionMode` in `app_metadata`): `confirmAll` (every non-read op asks), `autonomous` (default; only `Costly`/`Destructive` ask), `full` (never asks). Risk levels live in each `ToolSpec` in `ai/registry.rs` — change them there, not in the frontend.
- Confirmation flow: dispatch generates an id → emits `ai-confirm-request` to `main` → `ConfirmRequestDialog` → `ai_confirm_response` wakes the waiter. Timeout is 55s and returns `NEEDS_CONFIRMATION` with a retryable id. The main window is temporarily shown if it was hidden, then restored.
- `ai/context.rs` keeps a Rust-side ring buffer (danmaku 2000 / gifts 500 / activity 500 + metrics). The frontend zustand store is unreachable from Rust, so `bili/ws_client.rs` writes to this buffer next to each `emit`. `live_get_context` is the main "understand the room" tool.
- `send_queue.rs` is no longer dead code: AI sends go through `send_via_queue` (`SendPriority::Ai`) so they obey the user's send interval. `QueueItem` carries a `respond` oneshot for real results and a `seq` field for FIFO within the same priority (BinaryHeap is a max-heap, so `seq` compares reversed).
- MCP transport is Streamable HTTP on fixed `127.0.0.1:23332/mcp` with `Authorization: Bearer <token>` (`aiMcpToken` in `app_metadata`). Only `initialize` / `notifications/initialized` / `tools/list` / `tools/call` / `ping` are implemented — no SSE, no stdio (the single-instance plugin makes a client-spawned stdio process exit immediately).
- `settings_patch` only accepts a field whitelist (`sendInterval`/`rateLimit`/`riskControl`/`receive`/`filter`). Never widen it to the whole `Settings` struct — that walks into the `mergeSettings` one-level-deep merge trap and can crash old databases' settings page.
- Deliberately NOT exposed as tools: `proxy_image`, cache clearing, luminance sampling, `open_file_path`, `open_log_dir`, `download_file`, `check_update`, window geometry/dock/stealth internals.

## Data/contracts to keep in sync
- TS types in `src/types/` mirror Rust structs in `src-tauri/src/models/`; Rust models use `serde(rename_all = "camelCase")`. Keep field names aligned across both sides.
- New Tauri events should follow the existing pattern: emit in Rust (`app.emit` or `emit_to("main", ...)`), consume in frontend hooks/components via `useTauriEvent` / `listen`.
- Settings merge is **two levels** in the frontend (`mergeSettings` in `src/stores/settings-store.ts`): top-level keys via `DEEP_KEYS`, then a second pass for object-valued fields inside `appearance` (e.g. `priceColors`, `titleBarButtons`, `danmakuWindow`). Adding a new nested settings object without that second level makes old persisted data crash the settings page. Rust side mirrors this with field-level `#[serde(default)]`. Always sanity-check with an old database.
- Settings live in SQLite `app_metadata` (key `settings`), not `settings.json`; selections (`currentRoomId`, `favoriteRoomIds`, `roomViewMode`, `sidebarWidth`) and the danmaku window geometry (`window_state.rs` → `selections_store`) also live in `app_metadata`. Accounts/cookies use tauri-plugin-store (`credential.json`).
- localStorage holds only: `ui-scale`, theme key, divider ratios (`danmaku-divider-ratio`, `activity-divider-ratio`, `split-divider-ratio`), `lastUpdateCheck`, and emoticon package hidden lists.

## Docs conventions
- Guide pages must describe the UI that actually exists, using the exact on-screen labels. When a feature is absent (e.g. subtitle focus/cover toggle, drawer windows, mode switch), delete the claim rather than softening it.
- Feature lists in `README.md`, `docs/docs/guide/features.md` and the landing page (`docs/src/components/landing/data.ts`) describe the same product — keep them consistent with each other and with the code.
- `docs/docs/api/{ipc,events,mcp}.md` must stay complete: every registered command and every emitted event name should be listed with payload fields matching the Rust/TS definitions; MCP tools are documented in `mcp.md` and their specs live (single source of truth) in `src-tauri/src/ai/registry.rs`.

## CSS conventions for danmaku window
- `[data-transparent]` on html element makes body background transparent.
- `.danmaku-bg-main`, `.danmaku-bg-bar`, `.danmaku-bg-panel` use `var(--bg-a)` CSS variable for dynamic opacity.
- `.danmaku-btn-active` for emerald background on active state buttons.
- Interactive regions that must keep mouse events during 窗口透传 carry `data-interactive`.

## Commit policy (hard rule, user-mandated)
- **NEVER run `git commit` unless the user explicitly asks for a commit in their current message.** Implementing, finishing, or verifying a task is NOT commit consent. Leave changes in the working tree; the user commits (or asks) themselves.
- When the user does ask for commits, use conventional commit subjects with Chinese descriptions, e.g. `feat(danmaku): 解析开播/下播消息并渲染为系统行`, `feat(settings): 新增关闭主窗口行为设置（询问/隐藏/退出）`. Single-line subject only — no body, no process narration.
