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

## Repo shape
- `src/` is the Vite/React frontend. Vite root is `src`, output is `dist`, dev server is fixed to `http://localhost:3000` (`strictPort: true`).
- `src-tauri/` is the Tauri/Rust app. `tauri.conf.json` starts the renderer with `beforeDevCommand: npm run dev:renderer` and builds it with `beforeBuildCommand: npm run build:renderer`.
- Path alias `@/*` points to `src/*`.

## Architecture facts that affect edits
- Frontend boots from `src/main.tsx` with React Router + Zustand; `src/App.tsx` restores login, settings, rooms, and the saved room on startup. Also listens for tray events (`room-switched`, `account-switched`) to sync state.
- All frontend-to-Rust IPC goes through `src/lib/tauri.ts`. When adding a new Tauri command, add the TS wrapper there instead of calling `invoke()` ad hoc.
- Rust commands are registered centrally in `src-tauri/src/lib.rs` via `tauri::generate_handler!`. New commands must be added there.
- Window permissions must be declared in `src-tauri/capabilities/default.json` (e.g., `core:window:allow-start-dragging`, `core:window:allow-set-always-on-top`).
- All windows use `decorations: false` — custom title bars. Danmaku window has `transparent: true` for opacity support.
- Danmaku window close hides to tray (not disconnect). Separate exit button for actual disconnect.
- Tray single-click toggles danmaku window, double-click shows main window (250ms delay differentiation).
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
- `docs/` directory contains page structure, architecture, API reference, and research docs.
- Do not commit unless the user explicitly asks.
