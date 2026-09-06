# AGENTS.md

## Use these commands
- Install deps: `npm ci`.
- Full desktop dev: `npm run dev`.
- Frontend-only dev: `npm run dev:renderer`.
- Frontend verification: `npm run typecheck`.
- Rust verification: `cargo check` from `src-tauri/`.
- Build release: `npm run build`.
- Version bump: `.\scripts\bump-version.ps1 <version>`.
- No lite build variant — STT and AI are always compiled in, toggled at runtime via settings.
- There is no configured JS test/lint task in `package.json`; do not claim tests/lint passed unless you actually ran the available checks above.

## Required verification after code changes
- Default expectation: run `npm run typecheck` and `cargo check`.
- If you touched STT or AI code, verify both feature areas still compile.

## Release flow (CI)
- `.github/workflows/publish-tauri.yml`: pushing to `main` with a change to `src-tauri/tauri.conf.json` publishes a GitHub release tagged `app-v<version>` (skipped if the tag already exists). Treat version bumps as release triggers.
- Release changelog is parsed from conventional commit subjects (`feat:` / `fix:` / `refactor:`); anything else lands in "其他".
- CI gates on `npm run typecheck` and `cargo check` (in `src-tauri/`) before building.

## Repo shape
- `src/` is the Vite/React frontend. Vite root is `src`, output is `dist`, dev server is fixed to `http://localhost:3000` (`strictPort: true`).
- `src-tauri/` is the Tauri/Rust app. `tauri.conf.json` starts the renderer with `beforeDevCommand: npm run dev:renderer` and builds it with `beforeBuildCommand: npm run build:renderer`.
- Path alias `@/*` points to `src/*`.
- `docs/` is the VitePress documentation site. Run `npm run dev` in `docs/` to start the docs dev server.

## Architecture facts that affect edits
- Frontend boots from `src/main.tsx` with React Router + Zustand; `src/App.tsx` restores login, settings, rooms, and the saved room on startup. Also listens for tray events (`room-switched`, `account-switched`) to sync state.
- All frontend-to-Rust IPC goes through `src/lib/tauri.ts`. When adding a new Tauri command, add the TS wrapper there instead of calling `invoke()` ad hoc.
- Rust commands are registered centrally in `src-tauri/src/lib.rs` via `tauri::generate_handler!`. New commands must be added there.
- Window permissions must be declared in `src-tauri/capabilities/default.json` (e.g., `core:window:allow-start-dragging`, `core:window:allow-set-always-on-top`). The capability applies to windows `main` + `danmaku-*`.
- All windows use `decorations: false` — custom title bars. The main window is `transparent: true` + `shadow: false`; danmaku windows are created at runtime in `commands/room.rs` with labels `danmaku-{room_id}` and `.transparent(true)` for opacity support.
- Danmaku window close hides to tray (not disconnect). Separate exit button for actual disconnect.
- Tray single-click toggles the current window's visibility only (never swaps windows): the current window is the danmaku window while a room is connected (a `danmaku-*` window exists, even if hidden), otherwise the main window. Danmaku and main windows are mutually exclusive — entering a room hides the main window, and `exit_room` (a real disconnect, via the danmaku window's exit button) immediately restores it; hiding the danmaku window to tray is display-only, not a disconnect. The tray left-click handler fires only on `button_state == Up` (a physical click emits both Down and Up `Click` events). There is no tray menu item for switching/summoning windows.
- Dual credential: `state.credential` (main, for WS/audio) + `state.sending_credential` (for sending danmaku/emoticons). `get_sending_credential()` helper in `commands/mod.rs` falls back to main.
- STT and AI are always compiled in (no feature gates). Runtime toggles via settings control whether they're active.

## Data/contracts to keep in sync
- TS types in `src/types/` mirror Rust structs in `src-tauri/src/models/`; Rust models use `serde(rename_all = "camelCase")`. Keep field names aligned across both sides.
- New Tauri events should follow the existing pattern: emit in Rust, consume in frontend hooks/components via Tauri event listeners.
- Settings deep merge: `setSettings` in the frontend store merges loaded settings with `defaultSettings` to handle new fields in persisted data.

## CSS conventions for danmaku window
- `[data-transparent]` on html element makes body background transparent.
- `.danmaku-bg-main`, `.danmaku-bg-bar`, `.danmaku-bg-panel` use `var(--bg-a)` CSS variable for dynamic opacity.
- `.danmaku-btn-active` for emerald background on active state buttons.

## Existing repo instructions worth preserving
- `CLAUDE.md` contains the detailed architecture map and command list; use it when you need deeper context.
- `docs/` directory contains the VitePress documentation site (user guides, architecture, API reference).

## Commit policy (hard rule, user-mandated)
- **NEVER run `git commit` unless the user explicitly asks for a commit in their current message.** Implementing, finishing, or verifying a task is NOT commit consent. Leave changes in the working tree; the user commits (or asks) themselves.
- When the user does ask for commits, use conventional commit subjects with Chinese descriptions, e.g. `feat(danmaku): 解析开播/下播消息并渲染为系统行`, `feat(settings): 新增关闭主窗口行为设置（询问/隐藏/退出）`.
