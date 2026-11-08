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
  /** Cookie 过期时间（Unix 时间戳，秒） */
  expiresAt?: number;
}

/** 礼物面板中的单个礼物配置 */
export interface GiftConfig {
  id: number;
  name: string;
  /** 单价：金瓜子 price/1000 元；银瓜子为瓜子数 */
  price: number;
  /** gold 金瓜子 / silver 银瓜子 */
  coinType: "gold" | "silver" | string;
  desc: string;
  imgBasic: string;
}

/** 背包中的礼物条目 */
export interface GiftBagItem {
  bagId: number;
  giftId: number;
  giftName: string;
  giftNum: number;
}

/** 瓜子余额（金瓜子 1000 = 1 元） */
export interface WalletInfo {
  gold: number;
  silver: number;
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
  /** 最近一次观察到的开播时间（秒级时间戳）；未开播时展示"上次直播"用，未观察到过为 null */
  lastLiveStart: number | null;
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

/** 快捷键绑定（null = 未绑定/停用），格式如 "Ctrl+Alt+B" */
export interface ShortcutsSetting {
  /** 显示/隐藏应用窗口（全局，与托盘左键同语义） */
  toggleWindow: string | null;
  /** 弹幕窗进入/退出仅输入框模式（全局） */
  toggleInputOnly: string | null;
  /** 直播音频播放/暂停（全局） */
  toggleAudio: string | null;
  /** 直播音频静音（全局） */
  toggleMute: string | null;
  /** 界面放大（应用内） */
  uiZoomIn: string | null;
  /** 界面缩小（应用内） */
  uiZoomOut: string | null;
  /** 重置界面缩放（应用内） */
  uiZoomReset: string | null;
}

/** 弹幕窗口外观设置 */
export interface DanmakuWindowStyle {
  /** 强调色模式：follow 跟随全局主题 / custom 独立色 */
  accentMode: "follow" | "custom";
  /** 独立强调色 hex（accentMode = custom 时生效） */
  accentColor: string;
  /** 功能栏形态：pinned 常驻 / compact 收纳 */
  functionBar: "pinned" | "compact";
  /** 收起条开关：关闭后窗口贴边不再收缩成小条 */
  dockEnabled?: boolean;
  /** 收起条中央是否显示提示线（样式与尺寸固定，仅此项可配） */
  dockIndicator?: boolean;
}

/** 金额档位配色：醒目留言按金额分六档，礼物与舰长按类型/等级单独配色 */
export interface PriceColors {
  /** 醒目留言 ≤30 元 */
  scTier1: string;
  /** 醒目留言 31–50 元 */
  scTier2: string;
  /** 醒目留言 51–100 元 */
  scTier3: string;
  /** 醒目留言 101–500 元 */
  scTier4: string;
  /** 醒目留言 501–1000 元 */
  scTier5: string;
  /** 醒目留言 >1000 元 */
  scTier6: string;
  /** 礼物（不限金额） */
  gift: string;
  /** 总督 */
  guardGovernor: string;
  /** 提督 */
  guardAdmiral: string;
  /** 舰长 */
  guardCaptain: string;
}

/** 弹幕窗口标题栏按钮显隐（false = 从标题栏移除） */
export interface TitleBarButtons {
  /** 置顶 */
  pin: boolean;
  /** 锁定位置 */
  lock: boolean;
  /** 仅输入框模式 */
  inputOnly: boolean;
  /** 窗口透传 */
  passthrough: boolean;
  /** 隐身（鼠标离开自动隐藏） */
  stealth: boolean;
  /** 隐藏到托盘（关闭按钮） */
  close: boolean;
  /** 房间切换胶囊 */
  roomSwitcher: boolean;
}

export interface Settings {
  visual: VisualSetting;
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
    /** 弹幕窗跟随屏幕背景亮暗自动切换深浅 */
    autoThemeFromBackground?: boolean;
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
    /** 关闭后 SC/礼物/舰长与普通弹幕一致：无价格胶囊与着色，只保留纯文字 */
    plainPriceMessages: boolean;
    /** 礼物面板是否展示礼物图标（关闭后只显示名称与价格；仅 gift-send 构建有意义） */
    showGiftIcons: boolean;
    /** 金额档位配色（SC 六档 / 礼物 / 舰长三档）；缺项回退内置默认色 */
    priceColors: PriceColors;
    /** 侧边吸附收起/展开动画时长（毫秒），0 为关闭动画 */
    dockAnimMs: number;
    /** 自定义主题色（亮色模式 hex，空 = 默认石墨） */
    themeAccentLight: string;
    /** 自定义主题色（暗色模式 hex，空 = 默认石墨） */
    themeAccentDark: string;
    /** 弹幕窗口标题栏各按钮显隐（false = 移除） */
    titleBarButtons: TitleBarButtons;
    /** 弹幕窗口外观 */
    danmakuWindow: DanmakuWindowStyle;
  };
  notification: {
    muteAlert: boolean;
    cookieExpiry: boolean;
    sendSuccess: boolean;
    scAlert: boolean;
  };
  cache: {
    /** 三栏（弹幕/礼物/动态消息）共用的消息缓存上限，0 表示无限制（整场保留在内存） */
    messageLimit: number;
  };
  audio: AudioSetting;
  listen: ListenSetting;
  stt: SttSetting;
  filter: {
    blockedUsers: BlockedUser[];
    blockedKeywords: string[];
  };
  /** 关闭主窗口行为：ask（每次询问）/ hide（隐藏到托盘）/ exit（退出程序） */
  shortcuts: ShortcutsSetting;
  closeBehavior: "ask" | "hide" | "exit";
  /** 静默启动：启动时不显示主页面，只在系统托盘常驻 */
  silentStart: boolean;
  /** 在直播间列表、添加主播、账号与视频评论中展示头像 */
  showAvatars: boolean;
}

export type VisualFont = "system" | "yahei" | "dengxian" | "serif";
export interface VisualProfile {
  accent: string;
  /** 页面主背景（卡片外围、侧栏后的底色） */
  background: string;
  /** 卡片/面板底色。留空时由 background 自动推导，用于营造层次 */
  card: string;
  foreground: string;
  fontFamily: VisualFont;
  contentFontFamily: VisualFont | "inherit";
}
export interface VisualSetting {
  light: VisualProfile;
  dark: VisualProfile;
  uiFontSize: number;
  contentFontSize: number;
  contrast: number;
}

export interface AudioSetting {
  defaultVolume: number;
  autoPlay: boolean;
}

export interface ListenSetting {
  /** 在视频列表和播放页标题旁展示封面 */
  showCovers: boolean;
  autoNext: boolean;
  subtitleFontSize: number;
  subtitleAutoFollow: boolean;
  subtitleShowTime: boolean;
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
  /** 音频流内时间戳（毫秒，自当前 tee 连接起点起算），用于与播放进度对齐 */
  audioTsMs: number;
  /** 时间轴世代：tee 连接切换时递增，变化即需重新锚定 */
  epoch: number;
}
