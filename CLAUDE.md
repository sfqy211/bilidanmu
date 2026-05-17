# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BiliDanmu — Windows desktop Bilibili live-stream danmaku client. Tauri 2 (Rust backend) + React 18 + TypeScript (frontend).

## Commands

| Task | Command |
|---|---|
| Full dev (frontend + Tauri) | `npm run dev` |
| Frontend only (Vite on :3000) | `npm run dev:renderer` |
| Type check frontend | `npm run typecheck` |
| Rust check | `cd src-tauri && cargo check` |
| Build release | `npm run build` |

No test framework is configured. Always run `npm run typecheck` and `cargo check` after changes.

## Architecture

### Data flow

```
React component → tauriCommands.xxx (src/lib/tauri.ts) → invoke() IPC
    → Rust command handler (src-tauri/src/commands/*.rs)
    → Bili API layer (src-tauri/src/bili/*.rs)
    → Tauri event emit → useTauriEvent hook → Zustand store → React re-render
```

### Frontend

- **IPC layer**: `src/lib/tauri.ts` — all Tauri invoke calls go through `tauriCommands` object, namespaced by domain (auth, room, danmaku, ws, ai, settings, state, stt). Always add new IPC calls here.
- **State**: Zustand stores in `src/stores/` (auth, room, danmaku, ai, settings). State is flat; actions are inline.
- **Hooks**: `src/hooks/` — `useDanmakuStream` manages WebSocket lifecycle (connect on mount, disconnect on unmount, event listeners for danmaku-received/ws-connected/ws-disconnected/danmaku-error/ws-heartbeat). `useScheduler` manages loop sender lifecycle (auto-stop on room change and unmount). `useAudioPlayer` manages mpegts.js FLV→fMP4→MSE playback lifecycle (play/stop/volume/reconnect/clearStream). `useSttTranscript` listens for `stt-transcript` events, applies sync delay buffer, and drives `SubtitleOverlay` with on-demand RAF loop (stops when idle).
- **Path alias**: `@/*` → `./src/*`
- **Dev server**: Vite on port 3000 (strictPort)

### Backend (Rust)

- **AppState** (`src-tauri/src/lib.rs`): Multi-field struct with `TokioMutex<Option<BiliCredential>>`, `Mutex<HashMap<String, BiliCredential>>` (multi-account), `Mutex<Option<String>>` (active account), `Mutex<HashMap<String, AccountMeta>>`, `Arc<TokioMutex<WbiKeyCache>>`, `TokioMutex<Option<DanmakuWsClient>>`, `TokioMutex<AutoSenderState>`, `Arc<Mutex<Option<rusqlite::Connection>>>` (SQLite DB), `reqwest::Client` (proxy-aware HTTP), `Arc<StreamProxyServer>`, and `Arc<TokioMutex<Option<SttManager>>>`. All IPC commands receive `State<AppState>`.
- **Bili protocol layer** (`src-tauri/src/bili/`):
  - `credential.rs` — Cookie parsing, SESSDATA percent-encoding, validation
  - `wbi.rs` — WBI signature (MIXIN_KEY_ENC_TAB + MD5), key caching from `/x/web-interface/nav`
  - `protocol.rs` — 16-byte big-endian packet header, Brotli/zlib decompression, message parsing (DANMU_MSG, SEND_GIFT, INTERACT_WORD, SUPER_CHAT_MESSAGE). `parse_danmaku_command` is the main entry point.
  - `ws_client.rs` — WebSocket client with auth (op=7), heartbeat (op=30s), auto-reconnect (5s→10s→30s→60s backoff)
  - `api.rs` — `BiliApiClient` wrapping reqwest with User-Agent/Referer/Cookie headers
  - `buvid.rs` — Random hex + timestamp buvid3/buvid4 generation
- **Models** (`src-tauri/src/models/`): All structs use `serde(rename_all = "camelCase")` for TS interop. `DanmakuEvent` has `#[serde(rename = "type")]` on `event_type` field.
- **Persistence**: `tauri-plugin-store` for cookie (`cookie.json`) and rooms (`rooms.json`) via `credential_store.rs` and `room_store.rs`.
- **STT module** (`src-tauri/src/stt/`):
  - `pipeline.rs` — Main STT pipeline: FLV demux → AAC decode (symphonia 0.6) → resample (sherpa-onnx LinearResampler) → sherpa-onnx OnlineRecognizer → emit transcript events. `bytes_tx` is `Option<Sender>` so `stop()` can drop it to unblock `blocking_recv()`.
  - `flv_demux.rs` — FLV demuxer that extracts AAC frames, wraps in ADTS headers, parses AudioSpecificConfig for sample rate/channels. Has `MAX_TAG_DATA_SIZE` guard against malicious streams.
  - `mod.rs` — `SttManager` lifecycle (start/stop pipeline, transcript emit loop with `Notify` for instant cancellation).
- **Stream proxy** (`src-tauri/src/proxy/stream_proxy.rs`): hyper 1.x local HTTP proxy on random port, `OnceCell` lazy init, tee bytes to STT pipeline via `Arc<Mutex<Option<Sender>>>`.
- **Logging**: `tauri_plugin_log` configured with `LevelFilter::Info` + Stdout target only (no log file, no webview).

### Key patterns

- Frontend types in `src/types/danmaku.ts` and `src/types/bilibili.ts` must mirror Rust model structs in `src-tauri/src/models/`. Field names use camelCase (serde rename).
- New IPC commands: add Rust `#[tauri::command]` in `commands/*.rs`, register in `lib.rs` `.invoke_handler()`, add TS wrapper in `src/lib/tauri.ts`.
- New event types: emit via `app.emit("event-name", payload)` in Rust, listen via `useTauriEvent<T>("event-name", callback)` in frontend.
- Window close hides to tray (does not exit). System tray in `src-tauri/src/tray.rs`.
- STT pipeline runs in `spawn_blocking` to avoid blocking the tokio runtime. Pipeline cancellation: `bytes_tx = None` closes channel (unblocks `blocking_recv`) + `cancel` AtomicBool + `Notify` for transcript emit loop.
- `model_id` is an enum-like string (e.g., "large", "xlarge") — never an absolute path. `get_model_dir()` validates against path traversal (`..`/`/`\`) and resolves against `app_data_dir/models/stt/{model_id}`.
- `sherpa-onnx = "1.13"` crate provides `OnlineRecognizer`, `OnlineStream`, `LinearResampler` — all static-linked, no LLVM.
- `symphonia 0.6` for AAC decoding via ADTS reader (API differs significantly from 0.5).
- Audio samples normalization: unsigned types (U8/U16/U24/U32) centered to [-1, 1] to avoid DC bias; channel count from decoder output (not FLV header).
- FLV `data_size` capped at `MAX_TAG_DATA_SIZE=65536` to prevent memory exhaustion.

## Reference projects

The `reference/` directory contains upstream projects this codebase was designed from. Key references: `cc-switch` (Tauri 2 + React architecture), `BLSPAM` (Bilibili API + sender logic), `PiliPlus` (protocol + SC rendering), `bilibili-API-collect` (API documentation).
