export type SearchRoomMode = "name" | "roomId" | "link" | "uid";

/** 视频的一个分 P（听视频模式里的"一首歌"） */
export interface VideoPage {
  cid: number;
  page: number;
  part: string;
  duration: number;
}

export interface VideoInfo {
  bvid: string;
  aid: number;
  title: string;
  ownerName: string;
  ownerAvatar?: string;
  cover?: string;
  duration: number;
  pages: VideoPage[];
  /** 视频所属的合集/系列（联播用，可能为空） */
  season?: SeasonInfo;
}

export interface SeasonInfo {
  id: number;
  title: string;
  episodes: SeasonEpisode[];
}

export interface SeasonEpisode {
  bvid: string;
  cid: number;
  title: string;
  ownerName: string;
  cover?: string;
  duration: number;
}

/** 字幕行（听视频模式右侧字幕面板） */
export interface SubtitleLine {
  from: number;
  to: number;
  content: string;
}

/** 视频评论（只读） */
export interface VideoComment {
  rpid: number;
  memberName: string;
  memberAvatar?: string;
  content: string;
  like: number;
  ctime: number;
  replyCount: number;
  /** 当前用户是否已点赞（>=1 已点赞；未登录恒为 0） */
  action: number;
}

export interface CommentPage {
  total: number;
  list: VideoComment[];
}

export interface SearchVideoItem {
  bvid: string;
  title: string;
  author: string;
  cover?: string;
  duration: number;
}

export interface SearchVideoPage {
  total: number;
  keyword: string;
  list: SearchVideoItem[];
}

export interface WatchLaterItem {
  bvid: string;
  cid: number;
  title: string;
  ownerName: string;
  cover?: string;
  duration: number;
}

export interface AudioStreamInfo {
  /** 本地代理 URL（Range/206 直通，可直接作为 audio src） */
  url: string;
  codec: string;
}

/** 我创建的收藏夹（听视频模式里的"专辑列表"入口） */
export interface FavFolder {
  id: number;
  title: string;
  mediaCount: number;
}

/** 收藏夹内的一个视频 */
export interface FavResource {
  bvid: string;
  title: string;
  upperName: string;
  cover?: string;
  duration: number;
}

export interface FavResourcePage {
  total: number;
  list: FavResource[];
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
  /** 显示排序值：越小越靠前（直播中分组优先，组内默认后添加在前，拖拽可改） */
  sortOrder: number;
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
    hideUsername: boolean;
    hideContributionRank: boolean;
    opacity: number;
    emoticonStyle: "hidden" | "text" | "image";
    /** 活动栏（进场/点赞）显示模式：hidden 隐藏 / latest 只看最新一条 / scroll 滚动列表 */
    activityBarMode: "hidden" | "latest" | "scroll";
    /** 活动栏过滤：all 全部 / entry 只看进场 / like 只看点赞 */
    activityFilter: "all" | "entry" | "like";
    /** 是否在弹幕栏额外显示简化版醒目留言（礼物栏完整卡片不受影响） */
    scInDanmaku: boolean;
    /** 侧边吸附收起/展开动画时长（毫秒），0 为关闭动画 */
    dockAnimMs: number;
  };
  notification: {
    muteAlert: boolean;
    cookieExpiry: boolean;
    sendSuccess: boolean;
    scAlert: boolean;
  };
  cache: {
    /** 三栏（弹幕/礼物/动态消息）共用的消息缓存上限，0 表示无限制（内置安全上限 3000） */
    messageLimit: number;
  };
  audio: AudioSetting;
  stt: SttSetting;
  filter: {
    blockedUsers: BlockedUser[];
    blockedKeywords: string[];
  };
  /** 关闭主窗口行为：ask（每次询问）/ hide（隐藏到托盘）/ exit（退出程序） */
  closeBehavior: "ask" | "hide" | "exit";
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
