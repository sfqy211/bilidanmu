# AGENTS.md

## Use these commands
- Install deps: `npm ci`.
- Full desktop dev: `npm run dev`.
- Frontend-only dev: `npm run dev:renderer`.
- Frontend verification: `npm run typecheck`.
- Rust verification: `cargo check` from `src-tauri/`.
- Lite Rust verification/build (STT disabled): `cargo check --no-default-features` from `src-tauri/`, or `npm run build:lite`.
- There is no configured JS test/lint task in `package.json`; do not claim tests/lint passed unless you actually ran the available checks above.

## Required verification after code changes
- Default expectation: run `npm run typecheck` and `cargo check`.
- If you touched STT-gated Rust code, also verify whether the lite build should still compile with `cargo check --no-default-features`.

## Repo shape
- `src/` is the Vite/React frontend. Vite root is `src`, output is `dist`, dev server is fixed to `http://localhost:3000` (`strictPort: true`).
- `src-tauri/` is the Tauri/Rust app. `tauri.conf.json` starts the renderer with `beforeDevCommand: npm run dev:renderer` and builds it with `beforeBuildCommand: npm run build:renderer`.
- Path alias `@/*` points to `src/*`.

## Architecture facts that affect edits
- Frontend boots from `src/main.tsx` with React Router + React Query; `src/App.tsx` restores login, settings, rooms, and the saved room on startup.
- All frontend-to-Rust IPC goes through `src/lib/tauri.ts`. When adding a new Tauri command, add the TS wrapper there instead of calling `invoke()` ad hoc.
- Rust commands are registered centrally in `src-tauri/src/lib.rs` via `tauri::generate_handler!`. New commands must be added there.
- Window close is intercepted in `src-tauri/src/lib.rs`; closing the main window hides it to tray instead of exiting. Do not treat close as app shutdown.
- STT is behind the default `stt` Cargo feature (`sherpa-onnx` + `symphonia`). Anything under `#[cfg(feature = "stt")]` must keep both default and `--no-default-features` builds in mind.

## Data/contracts to keep in sync
- TS types in `src/types/` mirror Rust structs in `src-tauri/src/models/`; Rust models use `serde(rename_all = "camelCase")`. Keep field names aligned across both sides.
- New Tauri events should follow the existing pattern: emit in Rust, consume in frontend hooks/components via Tauri event listeners.

## Existing repo instructions worth preserving
- `CLAUDE.md` contains the detailed architecture map and command list; use it when you need deeper context.
- Do not commit unless the user explicitly asks.
