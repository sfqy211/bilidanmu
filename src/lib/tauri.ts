import { invoke } from "@tauri-apps/api/core";
import type {
  AIModel,
  AIModelInput,
  Credential,
  EmoticonPackage,
  LoginStatus,
  Room,
  RoomInfo,
  SearchRoomMode,
  SearchRoomResult,
  Settings,
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

export interface BiliResponse {
  code: number;
  message: string;
}

export const tauriCommands = {
  auth: {
    loginByQr: () => invoke<{ url: string; qrcodeKey: string }>("login_by_qr"),
    pollQr: (qrcodeKey: string) => invoke<Credential>("poll_qr", { qrcodeKey }),
    loginByCookie: (cookie: string) => invoke<Credential>("login_by_cookie", { cookie }),
    checkLoginStatus: () => invoke<LoginStatus>("check_login_status"),
    restoreLogin: () => invoke<Credential | null>("restore_login"),
    logout: () => invoke<void>("logout")
  },
  room: {
    search: (query: string, mode: SearchRoomMode) =>
      invoke<SearchRoomResult[]>("search_room", { query, mode }),
    add: (roomId: number) => invoke<RoomInfo>("add_room", { roomId }),
    remove: (roomId: number) => invoke<void>("remove_room", { roomId }),
    getInfo: (roomId: number) => invoke<RoomInfo>("get_room_info", { roomId }),
    getEmoticons: (roomId: number) =>
      invoke<EmoticonPackage[]>("get_emoticons", { roomId })
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
    startLoop: (roomId: number, messages: string[], intervalMs: number) =>
      invoke<void>("start_loop_send", { roomId, messages, intervalMs }),
    stopLoop: () => invoke<void>("stop_loop_send")
  },
  ws: {
    connect: (roomId: number) => invoke<void>("connect_danmaku_stream", { roomId }),
    disconnect: () => invoke<void>("disconnect_danmaku_stream")
  },
  ai: {
    getModels: () => invoke<AIModel[]>("get_ai_models"),
    addModel: (input: AIModelInput) => invoke<AIModel>("add_ai_model", { ...input }),
    testConnection: (input: AIModelInput) =>
      invoke<TestResult>("test_ai_connection", { ...input }),
    fetchModels: (endpoint: string, apiKey: string) =>
      invoke<string[]>("fetch_models", { endpoint, apiKey }),
    setCurrentModel: (id: string) => invoke<void>("set_current_model", { id })
  },
  settings: {
    get: () => invoke<Settings>("get_settings"),
    update: (settings: Settings) => invoke<void>("update_settings", { settings })
  },
  state: {
    getRooms: () => invoke<Room[]>("get_rooms")
  }
};
