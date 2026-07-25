export type SearchRoomMode = "name" | "roomId" | "link" | "uid";

export interface AiSuggestion {
  id?: string;
  type: "reply" | "summary";
  roomId: number;
  message: string;
  timestamp: number;
}

export interface AstrbotConfig {
  host: string;
  httpPort: number;
  callbackPort: number;
}

export interface Credential {
  accountId: string;
  uid: number;
  username: string;
  avatar?: string;
  cookie: string;
  biliJct?: string;
  /** Cookie 过期时间（Unix 时间戳，秒） */
  expiresAt?: number;
}

export interface QrLoginResult {
  url: string;
  qrcodeKey: string;
}

export interface QrPollResult {
  status: "pending" | "scanned" | "expired" | "success";
  message?: string;
  credential?: Credential;
}

export interface Room {
  id: string;
  roomId: number;
  uid?: number;
  title: string;
  uname: string;
  cover?: string;
  avatar?: string;
}

export interface RoomInfo extends Room {
  areaName?: string;
  parentAreaName?: string;
  description?: string;
}

export interface SearchRoomResult {
  roomId: number;
  uid?: number;
  uname: string;
  title: string;
  cover?: string;
  avatar?: string;
  isLive: boolean;
}

export interface Emoticon {
  emoji?: string;
  descript?: string;
  url: string;
  perm?: number;
  emoticonUnique?: string;
  emoticonId?: number;
  pkgId?: number;
  height?: number;
  width?: number;
  isDynamic?: number;
  unlockShowText?: string;
  emoticonOptions?: unknown;
}

export interface EmoticonPackage {
  pkgId: number;
  pkgName: string;
  pkgType?: number;
  currentCover?: string;
  emoticons: Emoticon[];
}

export interface UrlInfo {
  host: string;
  extra: string;
}

export interface StreamInfo {
  currentQn: number;
  acceptQn: number[];
  baseUrl: string;
  urlInfo: UrlInfo[];
  streamUrl: string;
  proxyUrl: string;
}

export function makePkgKey(pkg: EmoticonPackage): string {
  return `${pkg.pkgId}-${pkg.pkgType ?? 0}`;
}

export interface MessageTemplate {
  id: number;
  title: string;
  content: string;
  createdAt: number;
}

export interface UpdateInfo {
  latestVersion: string;
  currentVersion: string;
  hasUpdate: boolean;
  changelog: string;
  releaseUrl: string;
  publishedAt: string;
  assets: Array<{ name: string; downloadUrl: string; size: number }>;
}

export interface Settings {
  sendInterval: { min: number; max: number };
  rateLimit: { maxPerWindow: number; windowSec: number };
  riskControl: {
    randomInterval: boolean;
    jitter: boolean;
    autoPauseOnMute: boolean;
    appendRandomSuffix: boolean;
  };
  receive: {
    autoConnect: boolean;
    autoReconnect: boolean;
    reconnectInterval: number;
    maxReconnectInterval: number;
  };
  appearance: {
    theme: "light" | "dark" | "system";
    fontSize: number;
    showMedal: boolean;
    showLevel: boolean;
    hideGloryLevel: boolean;
    hideFanMedal: boolean;
    hideAdminBadge: boolean;
    hideUserIdColor: boolean;
    hideEntryMessage: boolean;
    hideLikeMessage: boolean;
    opacity: number;
    emoticonStyle: "hidden" | "text" | "image";
  };
  notification: {
    muteAlert: boolean;
    cookieExpiry: boolean;
    sendSuccess: boolean;
    scAlert: boolean;
  };
  cache: {
    danmakuLimit: number;
    giftLimit: number;
  };
  audio: AudioSetting;
  stt: SttSetting;
  filter: {
    blockedUsers: BlockedUser[];
    blockedKeywords: string[];
  };
}

export interface AudioSetting {
  defaultVolume: number;
  autoPlay: boolean;
}

export interface BlockedUser {
  uid: number;
  username: string;
}

export interface SttSetting {
  enabled: boolean;
  modelId: string;
  syncDelayMs: number;
}

export interface SttTranscript {
  text: string;
  isFinal: boolean;
}
