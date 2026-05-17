import { invoke } from "@tauri-apps/api/core";
import type {
  AIModel,
  AIModelInput,
  Credential,
  EmoticonPackage,
  QrLoginResult,
  QrPollResult,
  Room,
  RoomInfo,
  SearchRoomMode,
  SearchRoomResult,
  Settings,
  StreamInfo,
  SttTranscript,
  TestResult
} from "@/types/bilibili";

export interface SendOptions {
  color?: number;
  mode?: number;
  dmType?: number;
}

export interface SendEmoticonOptions extends SendOptions {
  emoticonOptions?: string;
}

export interface AutoSendEntry {
  message: string;
  dmType: number;
  emoticonOptions?: string;
}

export interface BiliResponse {
  code: number;
  message: string;
}

export const tauriCommands = {
  auth: {
    loginByQr: () => invoke<QrLoginResult>("login_by_qr"),
    pollQr: (qrcodeKey: string) => invoke<QrPollResult>("poll_qr", { qrcodeKey }),
    loginByCookie: (cookie: string) => invoke<Credential>("login_by_cookie", { cookie }),
    restoreLogin: () => invoke<Credential | null>("restore_login"),
    logout: () => invoke<Credential[]>("logout"),
    removeAccount: (accountId: string) => invoke<string | null>("remove_account", { accountId }),
    switchAccount: (accountId: string) => invoke<Credential>("switch_account", { accountId }),
    listAccounts: () => invoke<Credential[]>("list_accounts")
  },
  room: {
    search: (query: string, mode: SearchRoomMode) =>
      invoke<SearchRoomResult[]>("search_room", { query, mode }),
    add: (roomId: number) => invoke<RoomInfo>("add_room", { roomId }),
    remove: (roomId: number) => invoke<void>("remove_room", { roomId }),
    openDanmaku: (roomId: number) => invoke<void>("open_danmaku_window", { roomId }),
    getEmoticons: (roomId: number) =>
      invoke<EmoticonPackage[]>("get_emoticons", { roomId }),
    getAudioStreamUrl: (roomId: number) =>
      invoke<StreamInfo>("get_audio_stream_url", { roomId }),
    clearAudioStream: () =>
      invoke<void>("clear_audio_stream"),
    getRoomsLiveStatus: () =>
      invoke<Record<string, boolean>>("get_rooms_live_status")
  },
  danmaku: {
    send: (roomId: number, msg: string, options?: SendOptions) =>
      invoke<BiliResponse>("send_danmaku", { roomId, msg, ...options }),
    sendEmoticon: (roomId: number, emoticonUnique: string, options?: SendEmoticonOptions) =>
      invoke<BiliResponse>("send_emoticon", {
        roomId,
        emoticonUnique,
        ...options
      }),
    startAutoSend: (roomId: number, entries: AutoSendEntry[], intervalMs: number, timeLimitSecs?: number) =>
      invoke<void>("start_auto_send", { roomId, entries, intervalMs, timeLimitSecs: timeLimitSecs ?? null }),
    stopAutoSend: () => invoke<void>("stop_auto_send")
  },
  ws: {
    connect: (roomId: number) => invoke<void>("connect_danmaku_stream", { roomId }),
    disconnect: () => invoke<void>("disconnect_danmaku_stream")
  },
  ai: {
    getModels: () => invoke<AIModel[]>("get_ai_models"),
    addModel: (input: AIModelInput) => invoke<AIModel>("add_ai_model", { input }),
    updateModel: (id: string, input: AIModelInput) =>
      invoke<AIModel>("update_ai_model", { id, input }),
    testConnection: (input: AIModelInput) =>
      invoke<TestResult>("test_ai_connection", { input }),
    fetchModels: (endpoint: string, apiKey: string) =>
      invoke<string[]>("fetch_models", { endpoint, apiKey }),
    setCurrentModel: (id: string) => invoke<void>("set_current_model", { id }),
    deleteModel: (id: string) => invoke<void>("delete_ai_model", { id })
  },
  settings: {
    get: () => invoke<Settings>("get_settings"),
    update: (settings: Settings) => invoke<void>("update_settings", { settings })
  },
  state: {
    getRooms: () => invoke<Room[]>("get_rooms")
  },
  selections: {
    load: (keys: string[]) => invoke<Record<string, unknown>>("load_selections", { keys }),
    save: (entries: Record<string, unknown>) => invoke<void>("save_selections", { entries })
  },
  proxy: {
    image: (url: string) => invoke<string>("proxy_image", { url })
  },
  stt: {
    start: () => invoke<void>("start_stt"),
    stop: () => invoke<void>("stop_stt"),
    switchModel: (modelId: string) => invoke<void>("switch_stt_model", { modelId })
  }
};
