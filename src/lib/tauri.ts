import { invoke } from "@tauri-apps/api/core";
import type { AiPermissionMode, McpStatus } from "@/types/ai";
import type {
  AudioStreamInfo,
  CommentPage,
  Credential,
  FavFolder,
  FavResourcePage,
  GiftBagItem,
  GiftConfig,
  SearchVideoPage,
  SubtitleLine,
  VideoComment,
  WatchLaterItem,
  Emoticon,
  EmoticonPackage,
  MessageTemplate,
  QrPollResult,
  Room,
  RoomInfo,
  SttCatalogEntry,
  SearchRoomMode,
  SearchRoomResult,
  Settings,
  StreamInfo,
  SttTranscript,
  UpdateInfo,
  VideoInfo,
  WalletInfo
} from "@/types/bilibili";

export interface SendOptions {
  color?: number;
  mode?: number;
  dmType?: number;
}

export interface SendEmoticonOptions extends SendOptions {
  emoticonOptions?: string;
}

export interface SendGiftOptions {
  /** 背包条目 id，> 0 时走背包不扣费 */
  bagId?: number;
  /** gold 金瓜子（真实扣费）/ silver 银瓜子 */
  coinType?: string;
  /** 礼物单价（瓜子数），背包礼物填 0 */
  price?: number;
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
    loginByTvQr: () => invoke<{ url: string; authCode: string }>("login_by_tv_qr"),
    pollTvQr: (authCode: string) => invoke<QrPollResult & { accessKey?: string }>("poll_tv_qr", { authCode }),
    restoreLogin: () => invoke<Credential | null>("restore_login"),
    removeAccount: (accountId: string) => invoke<string | null>("remove_account", { accountId }),
    switchAccount: (accountId: string) => invoke<Credential>("switch_account", { accountId }),
    switchSendingAccount: (accountId: string) => invoke<Credential>("switch_sending_account", { accountId }),
    getSendingAccountId: () => invoke<string | null>("get_sending_account_id"),
    listAccounts: () => invoke<Credential[]>("list_accounts"),
    switchToAnonymous: () => invoke<Credential>("switch_to_anonymous"),
    refreshAccountInfo: (accountId: string) => invoke<Credential>("refresh_account_info", { accountId }),
    refreshCookie: (accountId: string) => invoke<Credential>("refresh_cookie", { accountId })
  },
  room: {
    search: (query: string, mode: SearchRoomMode) =>
      invoke<SearchRoomResult[]>("search_room", { query, mode }),
    add: (roomId: number) => invoke<RoomInfo>("add_room", { roomId }),
    remove: (roomId: number) => invoke<void>("remove_room", { roomId }),
    reorderRooms: (roomIds: number[]) => invoke<void>("reorder_rooms", { roomIds }),
    getFollowLives: () => invoke<SearchRoomResult[]>("get_follow_lives"),
    getInfo: (roomId: number) => invoke<RoomInfo>("get_room_info", { roomId }),
    openDanmaku: (roomId: number) => invoke<void>("open_danmaku_window", { roomId }),
    switchRoom: (roomId: number) => invoke<void>("switch_room", { roomId }),
    exitRoom: (roomId: number) => invoke<void>("exit_room", { roomId }),
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
    getInputOnly: () => invoke<boolean>("get_danmaku_input_only"),
    /** 采样弹幕窗背后的屏幕平均亮度 0.0~1.0；未开启或失败返回 null */
    sampleBackgroundLuminance: () =>
      invoke<number | null>("sample_background_luminance"),
    setInputOnly: (enabled: boolean) =>
      invoke<boolean>("set_danmaku_input_only", { enabled }),
    setInputOnlyEmotes: (open: boolean) =>
      invoke<boolean>("set_danmaku_input_only_emotes", { open }),
    getRoomsLiveStatus: () =>
      invoke<
        Record<string, { isLive: boolean; title: string; liveStartTime: number | null }>
      >("get_rooms_live_status"),
    getLiveTime: (roomId: number) =>
      invoke<number | null>("get_live_time", { roomId }),
    isMockEnabled: () => invoke<boolean>("is_mock_enabled")
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
  gift: {
    /** 礼物打赏是否随此构建启用（gift-send cargo feature，官方发布默认关闭） */
    isEnabled: () => invoke<boolean>("gift_send_enabled"),
    getRoomGifts: (roomId: number) => invoke<GiftConfig[]>("get_room_gifts", { roomId }),
    getGiftBag: (roomId: number) => invoke<GiftBagItem[]>("get_gift_bag", { roomId }),
    getGiftWallet: (roomId: number) => invoke<WalletInfo>("get_gift_wallet", { roomId }),
    sendGift: (roomId: number, ruid: number, giftId: number, giftNum: number, options?: SendGiftOptions) =>
      invoke<BiliResponse>("send_gift", {
        roomId,
        ruid,
        giftId,
        giftNum,
        bagId: options?.bagId ?? null,
        coinType: options?.coinType ?? null,
        price: options?.price ?? null
      })
  },
  ws: {
    connect: (roomId: number) => invoke<void>("connect_danmaku_stream", { roomId }),
    disconnect: () => invoke<void>("disconnect_danmaku_stream")
  },
  video: {
    getInfo: (bvid: string) => invoke<VideoInfo>("get_video_info", { bvid }),
    getAudio: (bvid: string, cid: number) => invoke<AudioStreamInfo>("get_video_audio", { bvid, cid }),
    stopAudio: () => invoke<void>("stop_video_audio"),
    listFavFolders: () => invoke<FavFolder[]>("list_fav_folders"),
    listFavResources: (mediaId: number, page?: number, size?: number) =>
      invoke<FavResourcePage>("list_fav_resources", { mediaId, page: page ?? 1, size: size ?? 20 }),
    getSubtitle: (bvid: string, cid: number) => invoke<SubtitleLine[]>("get_video_subtitle", { bvid, cid }),
    getComments: (aid: number, page?: number, sort?: number) =>
      invoke<CommentPage>("get_video_comments", { aid, page: page ?? 1, sort: sort ?? 1 }),
    searchVideos: (keyword: string, page?: number) => invoke<SearchVideoPage>("search_videos", { keyword, page: page ?? 1 }),
    listWatchLater: () => invoke<WatchLaterItem[]>("list_watch_later"),
    likeComment: (oid: number, rpid: number, like: boolean) =>
      invoke<void>("like_comment", { oid, rpid, like }),
    addComment: (oid: number, message: string, root?: number, parent?: number) =>
      invoke<VideoComment>("add_video_comment", { oid, message, root: root ?? null, parent: parent ?? null }),
    getCommentReplies: (oid: number, root: number, page?: number) =>
      invoke<CommentPage>("get_comment_replies", { oid, root, page: page ?? 1 }),
  },
  settings: {
    get: () => invoke<Settings>("get_settings"),
    update: (settings: Settings) => invoke<void>("update_settings", { settings }),
    isSttAvailable: () => invoke<boolean>("is_stt_available"),
    getShortcutErrors: () => invoke<string[]>("get_shortcut_errors")
  },
  state: {
    getRooms: () => invoke<Room[]>("get_rooms")
  },
  selections: {
    load: (keys: string[]) => invoke<Record<string, unknown>>("load_selections", { keys }),
    save: (entries: Record<string, unknown>) => invoke<void>("save_selections", { entries })
  },
  dock: {
    expand: (label: string) => invoke<void>("dock_expand", { label }),
    applyExpand: (label: string) => invoke<void>("dock_apply_expand", { label }),
    collapse: (label: string) => invoke<void>("dock_collapse", { label }),
    exit: (label: string) => invoke<void>("dock_exit", { label }),
    getState: (label: string) =>
      invoke<{ phase: "normal" | "collapsed" | "expanded" | "collapsing"; side?: "left" | "right" | "top" }>("get_dock_state", { label })
  },
  stealth: {
    set: (enabled: boolean) => invoke<boolean>("set_danmaku_stealth", { enabled }),
    get: () => invoke<{ enabled: boolean; visible: boolean }>("get_danmaku_stealth")
  },
  proxy: {
    image: (url: string, persistent?: boolean) =>
      invoke<string>("proxy_image", { url, persistent: persistent ?? false }),
    clearImageCache: () => invoke<void>("clear_image_cache"),
    getCacheStats: () => invoke<{ imageSize: number; imageCount: number; emoticonPkgCount: number; emoticonCount: number; emoticonImageSize: number }>("get_cache_stats")
  },
  stt: {
    start: () => invoke<void>("start_stt"),
    stop: () => invoke<void>("stop_stt"),
    switchModel: (modelId: string) => invoke<void>("switch_stt_model", { modelId }),
    getModelDir: () => invoke<string>("get_stt_model_dir"),
    listModels: () => invoke<string[]>("list_stt_models"),
    openModelDir: () => invoke<void>("open_stt_model_dir"),
    listAvailableModels: () => invoke<SttCatalogEntry[]>("list_available_stt_models"),
    getDownloadStatus: () => invoke<string | null>("get_stt_model_download_status"),
    startModelDownload: (modelId: string) => invoke<void>("start_stt_model_download", { modelId }),
    cancelModelDownload: (modelId: string) => invoke<void>("cancel_stt_model_download", { modelId })
  },
  messageTemplate: {
    list: () => invoke<MessageTemplate[]>("list_message_templates"),
    create: (title: string, content: string) =>
      invoke<number>("create_message_template", { title, content }),
    update: (id: number, title: string, content: string) =>
      invoke<void>("update_message_template", { id, title, content }),
    delete: (id: number) =>
      invoke<void>("delete_message_template", { id }),
  },
  update: {
    check: () => invoke<UpdateInfo>("check_update"),
    download: (url: string, filename: string) => invoke<string>("download_file", { url, filename }),
    openFile: (path: string) => invoke<void>("open_file_path", { path }),
  },
  log: {
    openDir: () => invoke<void>("open_log_dir"),
  },
  ai: {
    getPermissionMode: () => invoke<AiPermissionMode>("ai_get_permission_mode"),
    setPermissionMode: (mode: AiPermissionMode) =>
      invoke<void>("ai_set_permission_mode", { mode }),
    confirmResponse: (id: string, approved: boolean) =>
      invoke<boolean>("ai_confirm_response", { id, approved }),
    mcpStatus: () => invoke<McpStatus>("ai_mcp_status"),
    mcpStart: () => invoke<McpStatus>("ai_mcp_start"),
    mcpStop: () => invoke<McpStatus>("ai_mcp_stop"),
    mcpToken: () => invoke<string>("ai_mcp_token"),
    mcpRegenerateToken: () => invoke<string>("ai_mcp_regenerate_token"),
  },
  app: {
    quit: () => invoke<void>("quit_app_cmd"),
  }
};
