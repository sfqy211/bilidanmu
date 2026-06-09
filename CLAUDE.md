# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BiliDanmu — Windows desktop Bilibili live-stream danmaku client. Tauri 2 (Rust backend) + React 18 + TypeScript (frontend).

## Environment

- Node.js 18+
- Rust (rustup)
- Windows 10+ (WebView2 runtime)

## Commands

| Task | Command |
|---|---|
| Install dependencies | `npm ci` |
| Full dev (frontend + Tauri) | `npm run dev` |
| Frontend only (Vite on :3000) | `npm run dev:renderer` |
| Type check frontend | `npm run typecheck` |
| Rust check | `cd src-tauri && cargo check` |
| Build release | `npm run build` |
| Version bump | `.\scripts\bump-version.ps1 <version>` |

No test framework or linter is configured. Always run `npm run typecheck` and `cargo check` after changes.

**Runtime toggles**: STT and AI features are always compiled in (no feature gates). Users can enable/disable them in Settings. `is_stt_available()` and `is_ai_available()` always return `true`.

## CI/CD

`.github/workflows/publish-tauri.yml` triggers on push to `main` when `tauri.conf.json` version changes. It builds on Windows (`x86_64-pc-windows-msvc`) and publishes a GitHub release tagged `app-v<version>` using conventional-commit changelogs.

## Rules

- **Do not proactively commit to Git**: Unless the user explicitly requests a commit, only make code changes and do not run `git commit`. Commit only when the user says "commit" or "提交".

## Architecture

### Data flow

```
React component → tauriCommands.xxx (src/lib/tauri.ts) → invoke() IPC
    → Rust command handler (src-tauri/src/commands/*.rs)
    → Bili API layer (src-tauri/src/bili/*.rs)
    → Tauri event emit → useTauriEvent hook → Zustand store → React re-render
```

### Frontend

- **IPC layer**: `src/lib/tauri.ts` — all Tauri invoke calls go through `tauriCommands` object, namespaced by domain (auth, room, danmaku, ws, ai, settings, state, stt, proxy). Always add new IPC calls here.
- **State**: Zustand stores in `src/stores/` (auth, room, danmaku, ai, settings). State is flat; actions are inline. `@tanstack/react-query` is also used for data fetching.
- **Hooks**: `src/hooks/` — `useDanmakuStream` manages WebSocket lifecycle. `useAutoSend` / `useAutoLike` manage auto-send/like lifecycle. `useAudioPlayer` manages mpegts.js FLV→fMP4→MSE playback. `useSttTranscript` drives SubtitleOverlay. `useDividerDrag` manages draggable split divider. `useWindowPersistence` saves window size. `useTheme` manages light/dark/system theme.
- **Path alias**: `@/*` → `./src/*`
- **Dev server**: Vite on port 3000 (strictPort)
- **UI**: shadcn/ui components (Radix primitives + TailwindCSS + CSS variables). Components live in `src/components/ui/`; use `npx shadcn@latest add <component>` to add new ones.

### Backend (Rust)

- **AppState** (`src-tauri/src/lib.rs`): Multi-field struct with:
  - `TokioMutex<Option<BiliCredential>>` — main credential (for WS/audio viewing)
  - `TokioMutex<Option<BiliCredential>>` — sending credential (for danmaku/emoticon sending, falls back to main)
  - `std::sync::Mutex<HashMap<String, BiliCredential>>` — multi-account map
  - `std::sync::Mutex<Option<String>>` — active account ID
  - `std::sync::Mutex<HashMap<String, AccountMeta>>` — account metadata for tray
  - `Arc<TokioMutex<WbiKeyCache>>`, `TokioMutex<Option<DanmakuWsClient>>`, `TokioMutex<AutoSenderState>`, `TokioMutex<AutoLikeState>`
  - `Arc<StdMutex<Option<rusqlite::Connection>>>` — SQLite DB
  - `reqwest::Client` (shared, proxy-aware HTTP), `reqwest::Client` (astrbot, no-proxy)
  - `Arc<StreamProxyServer>`, `TokioMutex<Option<AstrbotConfig>>`, `Arc<TokioMutex<u16>>` (callback port)
  - `Arc<StdMutex<Vec<AiSuggestion>>>` (AI summaries), `Arc<TokioMutex<Option<SttManager>>>`
  - `credentials`/`active_account_id`/`account_metas` use `std::sync::Mutex` (never held across await)
  - `credential`/`sending_credential`/`wbi_cache`/`ws_client`/`auto_sender`/`astrbot_config`/`astrbot_callback_port` use `TokioMutex`
- **Bili protocol layer** (`src-tauri/src/bili/`):
  - `credential.rs` — Cookie parsing, SESSDATA percent-encoding, validation
  - `wbi.rs` — WBI signature (MIXIN_KEY_ENC_TAB + MD5), key caching from `/x/web-interface/nav`
  - `protocol.rs` — 16-byte big-endian packet header, Brotli/zlib decompression, message parsing (DANMU_MSG, SEND_GIFT, INTERACT_WORD, SUPER_CHAT_MESSAGE, GUARD_BUY). `parse_danmaku_command` is the main entry point.
  - `ws_client.rs` — WebSocket client with auth (op=7), heartbeat (op=30s), auto-reconnect (5s→10s→30s→60s backoff)
  - `api.rs` — `BiliApiClient` wrapping shared `reqwest::Client` with Referer/Cookie headers
  - `buvid.rs` — Random hex + timestamp buvid3/buvid4 generation
- **Models** (`src-tauri/src/models/`): All structs use `serde(rename_all = "camelCase")` for TS interop. `DanmakuEvent` has `#[serde(rename = "type")]` on `event_type` field.
- **Persistence**: SQLite (rusqlite) for rooms, emoticons, selections (`db.rs` + `room_store.rs` + `emoticon_store.rs` + `selections_store.rs`). `tauri-plugin-store` for cookies (`credential_store.rs`) and settings (`settings_store.rs`). Multi-account support: `credential_store.rs` manages `HashMap<String, String>` cookie map + `AccountMeta` (username/avatar) + active account ID.
- **STT module** (`src-tauri/src/stt/`):
  - `pipeline.rs` — Main STT pipeline: FLV demux → AAC decode (symphonia 0.6) → resample (sherpa-onnx LinearResampler) → sherpa-onnx OnlineRecognizer → emit transcript events. `bytes_tx` is `Option<Sender>` so `stop()` can drop it to unblock `blocking_recv()`.
  - `flv_demux.rs` — FLV demuxer that extracts AAC frames, wraps in ADTS headers, parses AudioSpecificConfig for sample rate/channels. Has `MAX_TAG_DATA_SIZE` guard against malicious streams.
  - `mod.rs` — `SttManager` lifecycle (start/stop pipeline, transcript emit loop with `Notify` for instant cancellation).
- **Stream proxy** (`src-tauri/src/proxy/stream_proxy.rs`): hyper 1.x local HTTP proxy on random port, `OnceCell` lazy init, tee bytes to STT pipeline via `Arc<Mutex<Option<Sender>>>`.
- **Logging**: `tauri_plugin_log` configured with `LevelFilter::Info` + Stdout target only (no log file, no webview).

### Window management

- All windows use `decorations: false` — no native title bars. Custom `TitleBar` component for main window, inline title bar for danmaku/AI windows.
- Danmaku window has `transparent: true` for background opacity support.
- `capabilities/default.json` must include window permissions (e.g., `core:window:allow-start-dragging`, `core:window:allow-toggle-maximize`, `core:window:allow-set-always-on-top`, `core:window:allow-set-ignore-cursor-events`).
- Tray single-click toggles danmaku window (show/hide), falls back to main window if no danmaku exists. Double-click always shows main window. 250ms delay differentiates single vs double click.
- Danmaku window close hides to tray (via `onCloseRequested` + `e.preventDefault()` + `appWindow.hide()`). Separate exit button disconnects WS/STT/AI and destroys window.
- `get_sending_credential()` helper in `commands/mod.rs` — checks `sending_credential` first, falls back to main `credential`.

### Key patterns

- Frontend types in `src/types/danmaku.ts` and `src/types/bilibili.ts` must mirror Rust model structs in `src-tauri/src/models/`. Field names use camelCase (serde rename).
- New IPC commands: add Rust `#[tauri::command]` in `commands/*.rs`, register in `lib.rs` `.invoke_handler()`, add TS wrapper in `src/lib/tauri.ts`.
- New event types: emit via `app.emit("event-name", payload)` in Rust, listen via `useTauriEvent<T>("event-name", callback)` in frontend.
- Vite root is `src/`, output is `dist/`, dev server fixed to `http://localhost:3000` (`strictPort: true`). `tauri.conf.json` uses `beforeDevCommand: npm run dev:renderer` and `beforeBuildCommand: npm run build:renderer`.
- STT pipeline runs in `spawn_blocking` to avoid blocking the tokio runtime. Pipeline cancellation: `bytes_tx = None` closes channel (unblocks `blocking_recv`) + `cancel` AtomicBool + `Notify` for transcript emit loop.
- `model_id` is an enum-like string (e.g., "large", "xlarge") — never an absolute path. `get_model_dir()` validates against path traversal (`..`/`/`\`) and resolves against `app_data_dir/models/stt/{model_id}`.
- `sherpa-onnx = "1.13"` crate provides `OnlineRecognizer`, `OnlineStream`, `LinearResampler` — all static-linked, no LLVM.
- `symphonia 0.6` for AAC decoding via ADTS reader (API differs significantly from 0.5).
- Audio samples normalization: unsigned types (U8/U16/U24/U32) centered to [-1, 1] to avoid DC bias; channel count from decoder output (not FLV header).
- FLV `data_size` capped at `MAX_TAG_DATA_SIZE=65536` to prevent memory exhaustion.
- Settings deep merge: `setSettings` in the frontend store merges loaded settings with `defaultSettings` to handle new fields in persisted data.
- Danmaku CSS: `index.css` defines `.danmaku-bg-main`, `.danmaku-bg-bar`, `.danmaku-bg-panel` classes using `var(--bg-a)` CSS variable for opacity. `[data-transparent]` makes html/body background transparent.
- `InlineMessage` component (`src/components/ui/InlineMessage.tsx`): unified notification with auto-dismiss (2s default), used with `key={msgKey}` pattern to force remount on same error.

## Reference projects

The `reference/` directory contains upstream projects this codebase was designed from. Key references: `cc-switch` (Tauri 2 + React architecture), `BLSPAM` (Bilibili API + sender logic), `PiliPlus` (protocol + SC rendering), `bilibili-API-collect` (API documentation).
