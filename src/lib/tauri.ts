import { invoke } from "@tauri-apps/api/core";
import type {
  AiSuggestion,
  AstrbotConfig,
  Credential,
  Emoticon,
  EmoticonPackage,
  QrLoginResult,
  QrPollResult,
  Room,
  RoomInfo,
  SearchRoomMode,
  SearchRoomResult,
  Settings,
  StreamInfo,
  SttTranscript
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
    removeAccount: (accountId: string) => invoke<string | null>("remove_account", { accountId }),
    switchAccount: (accountId: string) => invoke<Credential>("switch_account", { accountId }),
    switchSendingAccount: (accountId: string) => invoke<Credential>("switch_sending_account", { accountId }),
    getSendingAccountId: () => invoke<string | null>("get_sending_account_id"),
    listAccounts: () => invoke<Credential[]>("list_accounts")
  },
  room: {
    search: (query: string, mode: SearchRoomMode) =>
      invoke<SearchRoomResult[]>("search_room", { query, mode }),
    add: (roomId: number) => invoke<RoomInfo>("add_room", { roomId }),
    remove: (roomId: number) => invoke<void>("remove_room", { roomId }),
    openDanmaku: (roomId: number, width?: number, height?: number) =>
      invoke<void>("open_danmaku_window", { roomId, width: width ?? null, height: height ?? null }),
    openDrawer: (roomId: number, panel: string) =>
      invoke<void>("open_drawer_window", { roomId, panel }),
    getEmoticons: (roomId: number, force?: boolean, accountId?: string) =>
      invoke<EmoticonPackage[]>("get_emoticons", { roomId, force: force ?? false, accountId: accountId ?? null }),
    clearEmoticonCache: () => invoke<void>("clear_emoticon_cache"),
    clearRoomEmoticonCache: (roomId: number) => invoke<void>("clear_room_emoticon_cache", { roomId }),
    clearRoomSpecificEmoticons: () => invoke<void>("clear_room_specific_emoticons"),
    getFavoriteEmoticons: (accountId: string) =>
      invoke<Emoticon[]>("get_favorite_emoticons", { accountId }),
    addFavoriteEmoticon: (accountId: string, emoticon: Emoticon) =>
      invoke<void>("add_favorite_emoticon", { accountId, emoticon }),
    removeFavoriteEmoticon: (accountId: string, emoticonUnique: string) =>
      invoke<void>("remove_favorite_emoticon", { accountId, emoticonUnique }),
    updateFavoriteOrder: (accountId: string, emoticonUnique: string, sortOrder: number) =>
      invoke<void>("update_favorite_order", { accountId, emoticonUnique, sortOrder }),
    getAudioStreamUrl: (roomId: number) =>
      invoke<StreamInfo>("get_audio_stream_url", { roomId }),
    clearAudioStream: () =>
      invoke<void>("clear_audio_stream"),
    getRoomsLiveStatus: () =>
      invoke<Record<string, boolean>>("get_rooms_live_status"),
    getLiveTime: (roomId: number) =>
      invoke<number | null>("get_live_time", { roomId })
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
    sendLike: (roomId: number, anchorId: number, clickTime: number) =>
      invoke<BiliResponse>("send_like", { roomId, anchorId, clickTime }),
    startAutoSend: (roomId: number, entries: AutoSendEntry[], intervalMs: number, timeLimitSecs?: number) =>
      invoke<void>("start_auto_send", { roomId, entries, intervalMs, timeLimitSecs: timeLimitSecs ?? null }),
    stopAutoSend: () => invoke<void>("stop_auto_send"),
    startAutoLike: (roomId: number, anchorId: number, targetTotal: number, batchSize: number, intervalMs: number) =>
      invoke<void>("start_auto_like", { roomId, anchorId, targetTotal, batchSize, intervalMs }),
    stopAutoLike: () => invoke<void>("stop_auto_like")
  },
  ws: {
    connect: (roomId: number) => invoke<void>("connect_danmaku_stream", { roomId }),
    disconnect: () => invoke<void>("disconnect_danmaku_stream")
  },
  ai: {
    configure: (host: string, httpPort: number, callbackPort: number) =>
      invoke<void>("configure_astrbot", { host, httpPort, callbackPort }),
    getConfig: () => invoke<AstrbotConfig | null>("get_astrbot_config"),
    switchRoom: (roomId: number, callbackUrl?: string, uname?: string, title?: string) =>
      invoke<void>("switch_astrbot_room", { roomId, callbackUrl: callbackUrl ?? null, uname: uname ?? null, title: title ?? null }),
    disconnect: () => invoke<void>("disconnect_astrbot"),
    trigger: (action: string, context: string) =>
      invoke<string[]>("trigger_astrbot", { action, context }),
    learn: (chosen: string, options: string[]) =>
      invoke<void>("learn_astrbot", { chosen, options }),
    getStatus: () => invoke<Record<string, unknown>>("get_astrbot_status"),
    getCallbackPort: () => invoke<number>("get_callback_port"),
    getSummaries: () => invoke<AiSuggestion[]>("get_ai_summaries"),
    clearSummaries: () => invoke<void>("clear_ai_summaries"),
  },
  settings: {
    get: () => invoke<Settings>("get_settings"),
    update: (settings: Settings) => invoke<void>("update_settings", { settings }),
    isSttAvailable: () => invoke<boolean>("is_stt_available"),
    isAiAvailable: () => invoke<boolean>("is_ai_available")
  },
  state: {
    getRooms: () => invoke<Room[]>("get_rooms")
  },
  selections: {
    load: (keys: string[]) => invoke<Record<string, unknown>>("load_selections", { keys }),
    save: (entries: Record<string, unknown>) => invoke<void>("save_selections", { entries })
  },
  proxy: {
    image: (url: string, persistent?: boolean) =>
      invoke<string>("proxy_image", { url, persistent: persistent ?? false }),
    clearImageCache: () => invoke<void>("clear_image_cache")
  },
  stt: {
    start: () => invoke<void>("start_stt"),
    stop: () => invoke<void>("stop_stt"),
    switchModel: (modelId: string) => invoke<void>("switch_stt_model", { modelId }),
    getModelDir: () => invoke<string>("get_stt_model_dir"),
    listModels: () => invoke<string[]>("list_stt_models"),
    openModelDir: () => invoke<void>("open_stt_model_dir")
  }
};
