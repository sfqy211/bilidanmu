import { useTranslation as useDesktopTranslation, i18n as desktopI18n } from "@/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "@/i18n";
import { useNavigate, useParams } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useWindowDock } from "@/hooks/useWindowDock";

const appWindow = getCurrentWindow();
import { ChevronDown, ClipboardList, Clock, Expand, Eye, Gift, MessageSquare, Plus, Send, Settings, ShieldBan, Smile, ThumbsUp, Users, Zap } from "lucide-react";
import { AccountSwitcher } from "@/components/danmaku/AccountSwitcher";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { RoomSwitcher } from "@/components/danmaku/RoomSwitcher";
import { AutoSendPanel } from "@/components/danmaku/AutoSendPanel";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { MessageClipboardPanel } from "@/components/danmaku/MessageClipboardPanel";
import { DanmakuMessageItem } from "@/components/danmaku/DanmakuMessageItem";
import { EmoticonPickerPanel } from "@/components/danmaku/EmoticonPickerPanel";
import { GiftPanel } from "@/components/danmaku/GiftPanel";
import { FloatingPanel } from "@/components/danmaku/FloatingPanel";
import {
  PanelChip,
  PanelRow,
  PanelSection,
  PanelSegmented,
  PanelShell,
} from "@/components/ui/DanmakuPanel";
import { FilterPanel } from "@/components/danmaku/FilterPanel";
import { SubtitleOverlay } from "@/components/danmaku/SubtitleOverlay";
import { useDanmaku } from "@/hooks/useDanmaku";
import { useAutoLike } from "@/hooks/useAutoLike";
import { useAutoSend } from "@/hooks/useAutoSend";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useDanmakuStream } from "@/hooks/useDanmakuStream";
import { useDividerDrag } from "@/hooks/useDividerDrag";
import { useSttTranscript } from "@/hooks/useSttTranscript";
import { useDanmakuWindowAppearance } from "@/hooks/useDanmakuWindowAppearance";
import { usePanelDismiss } from "@/hooks/usePanelDismiss";
import { DanmakuInput } from "@/components/danmaku/DanmakuInput";
import { DanmakuWindow } from "@/components/danmaku/DanmakuWindow";
import { DanmakuWindowAppearanceSettings } from "@/components/danmaku/DanmakuWindowAppearanceSettings";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { tauriCommands } from "@/lib/tauri";
import { HIDE_APPEARANCE_KEYS, ACTIVITY_BAR_MODES, ACTIVITY_FILTERS } from "@/components/settings/constants";
import { formatNumber } from "@/i18n/format";
import { OpacitySlider } from "@/components/settings/OpacitySlider";
import { useAuthStore } from "@/stores/auth-store";
import { useDanmakuStore } from "@/stores/danmaku-store";
import { useRoomStore } from "@/stores/room-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { DanmakuMessage } from "@/types/danmaku";
import type { Emoticon, EmoticonPackage, Settings as SettingsType } from "@/types/bilibili";
import { makePkgKey } from "@/types/bilibili";

function serializeEmoticonOptions(emoticon: Emoticon): string | undefined {
  if (emoticon.emoticonOptions) {
    return JSON.stringify(emoticon.emoticonOptions);
  }

  if (!emoticon.emoticonUnique) {
    return undefined;
  }

  return JSON.stringify({ emoticon_unique: emoticon.emoticonUnique });
}

function getMessageScrollKey(message: DanmakuMessage | undefined): string {
  return message ? `${message.roomId}-${message.id}-${message.timestamp}` : "";
}

function useAutoScroll(messages: DanmakuMessage[]) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const msgCountRef = useRef(messages.length);
  const lastMessageKeyRef = useRef<string | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // 回调 ref 同步维护 ResizeObserver：列表会随分割条折叠而卸载、恢复后重新挂载，
  // 一次性 effect 会漏掉后挂载的节点。列表可视区变矮时保持吸底——输入框随多行
  // 文字撑高会挤占上方列表的高度，而浏览器不会因为视口变小就调整 scrollTop
  // （scrollHeight 没变、也不触发 scroll 事件），原本贴底的最新一行会被下边缘
  // 裁掉半行。只有原本就贴底时才跟随，用户上翻查看历史时不打扰。
  const attachScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (!isAtBottomRef.current) return;
      node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    resizeObserverRef.current = observer;
  }, []);

  useEffect(() => () => resizeObserverRef.current?.disconnect(), []);

  const checkAtBottom = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const threshold = 80;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom <= threshold;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
  }, []);

  useEffect(() => {
    const prevCount = msgCountRef.current;
    const lastMessageKey = getMessageScrollKey(messages[messages.length - 1]);

    if (lastMessageKeyRef.current === null) {
      lastMessageKeyRef.current = lastMessageKey;
      msgCountRef.current = messages.length;
      return;
    }

    const hasNewTailMessage = lastMessageKey !== lastMessageKeyRef.current;

    if (!hasNewTailMessage && messages.length === prevCount) return;

    msgCountRef.current = messages.length;
    lastMessageKeyRef.current = lastMessageKey;

    if (!hasNewTailMessage || !isAtBottomRef.current) return;
    const container = scrollRef.current;
    if (!container) return;
    const behavior = messages.length - prevCount > 3 ? "instant" : "smooth";
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    container.scrollTo({ top: container.scrollHeight, behavior: "instant" });
    // scrollTo 触发的 scroll 事件中 scrollHeight 可能还未更新，
    // 延迟一帧重新确认底部状态
    requestAnimationFrame(() => {
      isAtBottomRef.current = true;
      setIsAtBottom(true);
    });
  }, []);

  return { scrollRef, attachScrollRef, isAtBottom, checkAtBottom, scrollToBottom };
}

const PANEL = {
  AUTO_SEND: "autoSend",
  EMOTICON: "emoticon",
  GIFT: "gift",
  FILTER: "filter",
  SETTINGS: "settings",
  CLIPBOARD: "clipboard",
} as const;

export function DanmakuPage() {
  const { t: translate } = useDesktopTranslation("desktop");
  const { t } = useTranslation("danmaku");
  const { roomId: roomIdParam } = useParams();
  // 房间号 0 是合法值（虚拟直播间），仅 NaN/缺失视为无房间
  const roomId = useMemo(() => {
    if (roomIdParam == null) return null;
    const parsed = Number(roomIdParam);
    return Number.isFinite(parsed) ? parsed : null;
  }, [roomIdParam]);
  const [message, setMessage] = useState("");
  const inputBarRef = useRef<HTMLDivElement | null>(null);
  const panelHostRef = useRef<HTMLDivElement | null>(null);
  const panelIgnoreRefs = useMemo(() => [inputBarRef, panelHostRef], []);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const togglePanel = useCallback((name: string) => {
    setActivePanel((prev) => (prev === name ? null : name));
  }, []);
  const emoticonPickerOpen = activePanel === PANEL.EMOTICON;
  const giftPanelOpen = activePanel === PANEL.GIFT;
  // 礼物打赏由 gift-send cargo feature 门控，官方发布默认关闭：关闭时完全不渲染入口
  const [giftSendEnabled, setGiftSendEnabled] = useState(false);
  useEffect(() => {
    void tauriCommands.gift
      .isEnabled()
      .then(setGiftSendEnabled)
      .catch(() => setGiftSendEnabled(false));
  }, []);
  // 按账号维护的表情包缓存（key = accountId, value = 该账号的表情包列表）
  const [emoticonPkgMap, setEmoticonPkgMap] = useState<Map<string, EmoticonPackage[]>>(new Map());
  // 按账号维护的收藏表情（key = accountId）
  const [favoriteMap, setFavoriteMap] = useState<Map<string, Emoticon[]>>(new Map());
  const [loadingEmoticons, setLoadingEmoticons] = useState(false);
  const [emoticonError, setEmoticonError] = useState<string | null>(null);
  const [activePkgKey, setActivePkgKey] = useState<string | null>(null);
  const autoSendOpen = activePanel === PANEL.AUTO_SEND;
  const settingsOpen = activePanel === PANEL.SETTINGS;
  const filterOpen = activePanel === PANEL.FILTER;
  const clipboardOpen = activePanel === PANEL.CLIPBOARD;
  // 仅输入框紧凑模式：Rust 侧管窗口尺寸/约束/吸附互斥，前端只切渲染形态
  const [inputOnly, setInputOnly] = useState(false);
  useEffect(() => {
    void tauriCommands.room.getInputOnly().then(setInputOnly).catch(() => {});
  }, []);
  useTauriEvent<boolean>("danmaku-input-only", setInputOnly);
  const toggleInputOnly = useCallback(() => {
    // 进入紧凑模式时收起已打开的浮层面板
    setActivePanel(null);
    void tauriCommands.room.setInputOnly(!inputOnly).catch(() => {});
  }, [inputOnly]);
  const inputOnlyGripCleanupRef = useRef<(() => void) | null>(null);
  // 仅输入框模式右侧的二合一控件：拖动＝移动窗口，点按＝回到完整窗口。
  // 位移超过阈值才交给系统拖动；一旦 startDragging 交出去，mouseup 未必还能回到本窗口，
  // 所以调用前先摘掉监听，避免松手时被当成一次点击。
  const handleInputOnlyGrip = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, locked: boolean) => {
      if (event.button !== 0) return;
      // 上一次的监听若因鼠标移出窗口没收到 mouseup，先清掉，避免残留的 mousemove 误触发拖动
      inputOnlyGripCleanupRef.current?.();
      const startX = event.clientX;
      const startY = event.clientY;
      let moved = false;
      const cleanup = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        inputOnlyGripCleanupRef.current = null;
      };
      const onMove = (move: MouseEvent) => {
        if (moved) return;
        if (Math.hypot(move.clientX - startX, move.clientY - startY) < 4) return;
        moved = true;
        // 锁定位置时只记录位移，不发起拖动：这样松手不会被当成点击而误恢复窗口
        if (locked) return;
        cleanup();
        void appWindow.startDragging();
      };
      const onUp = () => {
        cleanup();
        // 全程没位移就是一次点击：回到完整窗口
        if (!moved) toggleInputOnly();
      };
      inputOnlyGripCleanupRef.current = cleanup;
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [appWindow, toggleInputOnly],
  );
  const { disconnect } = useDanmakuStream(roomId);

  const navigate = useNavigate();
  // 常驻弹幕窗口不销毁：托盘/页内切换直播间时原地切路由，
  // 所有按 roomId 挂钩的副作用（弹幕流/表情/音频/AI/STT）自动重置
  useTauriEvent<number>("room-switched", (payload) => {
    if (payload !== roomId) {
      navigate(`/danmaku/${payload}`);
    }
  });

  const storeDanmakuMessages = useDanmakuStore((state) => state.danmakuMessages);
  const storeGiftMessages = useDanmakuStore((state) => state.giftMessages);
  const totalLikeCount = useDanmakuStore((state) => state.totalLikeCount);
  const wsStatus = useDanmakuStore((state) => state.wsStatus);
  const wsError = useDanmakuStore((state) => state.lastError);
  const guardCount = useDanmakuStore((state) => state.guardCount);

  // 礼物栏筛选
  const [showGift, setShowGift] = useState(true);
  const [showSuperChat, setShowSuperChat] = useState(true);
  const [showGuard, setShowGuard] = useState(true);
  const [batteryFilter, setBatteryFilter] = useState(0);
  const [batteryInput, setBatteryInput] = useState("");
  const [showBatteryFilter, setShowBatteryFilter] = useState(false);
  const onlineCount = useDanmakuStore((state) => state.onlineCount);
  const watchedCount = useDanmakuStore((state) => state.watchedCount);
  const danmakuCount = useDanmakuStore((state) => state.danmakuCount);
  const superChatCount = useDanmakuStore((state) => state.superChatCount);
  const rooms = useRoomStore((state) => state.rooms);
  const activeAccountId = useAuthStore((state) => state.activeAccountId);
  const isAnonymous = useAuthStore((state) => state.isAnonymous);
  const currentRoom = rooms.find((r) => r.roomId === roomId);

  // 进入直播间上报（可选）：观看时长/粉丝团亲密度等以 B 站收到 room_entry_action 为准。
  // 匿名模式无凭据、房间号 0 是虚拟直播间，均跳过；失败静默（不阻塞进入流程）。
  const entryActionEnabled = useSettingsStore((state) => state.settings.receive?.entryAction ?? false);
  useEffect(() => {
    if (!entryActionEnabled || roomId === null || roomId <= 0) return;
    if (!activeAccountId || isAnonymous) return;
    tauriCommands.room.entryAction(roomId).catch(() => {});
  }, [entryActionEnabled, roomId, activeAccountId, isAnonymous]);

  // 匿名模式下，房间可能不在 room store 中，需要从 API 获取房间信息
  const [fetchedRoomInfo, setFetchedRoomInfo] = useState<{ uname: string; title: string } | null>(null);
  useEffect(() => {
    if (roomId === null || currentRoom) {
      setFetchedRoomInfo(null);
      return;
    }
    let cancelled = false;
    tauriCommands.room.getInfo(roomId).then((info) => {
      if (!cancelled) {
        setFetchedRoomInfo({ uname: info.uname, title: info.title });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [roomId, currentRoom]);

  // 优先使用 room store 中的数据，否则使用从 API 获取的数据。
  // 直播中主播改标题（ROOM_CHANGE）时用本地覆盖，不改持久化的房间记录。
  const [liveTitle, setLiveTitle] = useState<string | null>(null);
  useEffect(() => {
    setLiveTitle(null);
  }, [roomId]);
  useTauriEvent<{ roomId: number; title: string }>("room-title-changed", (payload) => {
    if (payload.roomId === roomId && payload.title) setLiveTitle(payload.title);
  });
  const baseRoomInfo = currentRoom
    ? { uname: currentRoom.uname, title: currentRoom.title }
    : fetchedRoomInfo;
  const displayRoomInfo = baseRoomInfo && liveTitle
    ? { ...baseRoomInfo, title: liveTitle }
    : baseRoomInfo;

  // 当前有效的发送账号 ID（AccountSwitcher 切换时会更新 activeAccountId）
  const effectiveSendingId = activeAccountId;

  // 收藏表情包 key（与 makePkgKey 生成的一致）
  const FAVORITE_PKG_KEY = "-1--1";
  // 当前账号的收藏表情
  const currentFavorites = useMemo(
    () => (effectiveSendingId ? favoriteMap.get(effectiveSendingId) ?? [] : []),
    [favoriteMap, effectiveSendingId],
  );
  // 当前房间可用的表情 unique 集合（用于过滤收藏）
  // 仅依赖当前账号的包数据，避免其他账号的包变化触发重建
  const availableEmotUniques = useMemo(() => {
    const pkgs = effectiveSendingId ? emoticonPkgMap.get(effectiveSendingId) : undefined;
    if (!pkgs) return new Set<string>();
    const set = new Set<string>();
    for (const pkg of pkgs) {
      for (const emot of pkg.emoticons) {
        if (emot.emoticonUnique) set.add(emot.emoticonUnique);
      }
    }
    return set;
  }, [emoticonPkgMap, effectiveSendingId]);
  // 过滤后的收藏表情（仅保留当前房间可用的）
  const filteredFavorites = useMemo(
    () => currentFavorites.filter((e) => e.emoticonUnique && availableEmotUniques.has(e.emoticonUnique)),
    [currentFavorites, availableEmotUniques],
  );
  // 收藏虚拟包（始终显示，空时展示提示）
  const favoritePkg = useMemo<EmoticonPackage>(() => ({
    pkgId: -1,
    pkgName: translate("liveWindow.favorites"),
    pkgType: -1,
    currentCover: filteredFavorites[0]?.url,
    emoticons: filteredFavorites,
  }), [filteredFavorites, translate]);

  // 当前账号的表情包列表（含收藏包）
  const emoticonPackages = useMemo(() => {
    const base = effectiveSendingId ? emoticonPkgMap.get(effectiveSendingId) ?? [] : [];
    return favoritePkg ? [favoritePkg, ...base] : base;
  }, [emoticonPkgMap, effectiveSendingId, favoritePkg]);
  // 已加载表情包中所有表情 URL 集合，用于弹幕表情优先复用本地缓存
  const cachedEmotUrls = useMemo(() => {
    const urls = new Set<string>();
    for (const pkg of emoticonPackages) {
      for (const emot of pkg.emoticons) {
        if (emot.url) urls.add(emot.url);
      }
    }
    return urls;
  }, [emoticonPackages]);

  // 开播时长
  const [liveTime, setLiveTime] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (roomId === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const fetchLiveTime = async () => {
      try {
        const ts = await tauriCommands.room.getLiveTime(roomId);
        if (!cancelled) {
          setLiveTime(ts);
        }
      } catch {
        // 忽略
      }
    };

    void fetchLiveTime();
    // 每 5 分钟刷新一次开播时间
    timer = setInterval(() => void fetchLiveTime(), 5 * 60 * 1000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [roomId]);

  // 每分钟更新一次当前时间，刷新时长显示
  useEffect(() => {
    if (liveTime == null) return;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [liveTime]);

  const liveDuration = useMemo(() => {
    if (liveTime == null) return null;
    const ms = now - liveTime * 1000;
    if (ms < 0) return null;
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 1) return translate("liveWindow.justLive");
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0) return `${h}h${m}m`;
    return `${m}m`;
  }, [liveTime, now, translate]);

  const { send, sendEmoticon, sendGift, sending } = useDanmaku();
  const audioSettings = useSettingsStore((s) => s.settings.audio);
  const sttSettings = useSettingsStore((s) => s.settings.stt);
  const fontSize = useSettingsStore((s) => s.settings.appearance.fontSize);
  // 隐身淡出：窗口本身是真透明，内容整体淡出即为"隐身"。
  // 显示比隐藏快一点：悬停要跟手，离开后渐隐不突兀
  const opacity = useSettingsStore((s) => s.settings.appearance.opacity);
  // 弹幕窗外观：功能栏形态与收起条样式（旧数据缺字段时按默认）
  const danmakuWindow = useSettingsStore((s) => s.settings.appearance.danmakuWindow);
  const compactBar = (danmakuWindow?.functionBar ?? "pinned") === "compact";
  const [barMenuOpen, setBarMenuOpen] = useState(false);
  useEffect(() => { setBarMenuOpen(false); }, [roomId]);
  const sttAvailable = useSettingsStore((s) => s.sttAvailable);
  const patchSettings = useSettingsStore((s) => s.patchSettings);
  const settings = useSettingsStore((s) => s.settings);

  // 弹幕页设置变更：更新本地状态并持久化到磁盘
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const commitSettings = useCallback(
    (partial: Partial<SettingsType>) => {
      patchSettings(partial);
      void saveSettings();
    },
    [patchSettings, saveSettings]
  );
  const {
    audioRef,
    isPlaying: audioPlaying,
    isConnecting: audioConnecting,
    isMuted: audioMuted,
    volume: audioVolume,
    error: audioError,
    play: audioPlay,
    stop: audioStop,
    setVolume: audioSetVolume,
    toggleMute: audioToggleMute,
  } = useAudioPlayer(roomId, audioSettings.defaultVolume / 100);
  // 全局快捷键的音频动作：播放器状态在 webview 内，由 Rust 经事件转发到这里执行
  // playAudio/stopAudio 是 AI/MCP 的确定性控制（与 toggleAudio 的翻转语义区分开）
  useTauriEvent<string>("global-shortcut-action", (action) => {
    if (action === "toggleAudio") {
      if (audioPlaying) void audioStop();
      else void audioPlay();
    } else if (action === "playAudio") {
      if (!audioPlaying) void audioPlay();
    } else if (action === "stopAudio") {
      if (audioPlaying) void audioStop();
    } else if (action === "toggleMute") {
      audioToggleMute();
    }
  });
  // 其他窗口（含 AI/MCP）改了设置：同步到本地 store，字幕联动 effect 才能跟上
  const setSettings = useSettingsStore((s) => s.setSettings);
  useTauriEvent<SettingsType>("settings-changed", (incoming) => {
    setSettings(incoming);
  });
  // 字幕对齐需要播放进度作为调度时钟（暂停时字幕冻结）
  const getAudioCurrentTime = useCallback(() => audioRef.current?.currentTime ?? 0, []);
  const { currentText: sttText, isSpeaking: sttSpeaking } = useSttTranscript(
    sttAvailable ? sttSettings.syncDelayMs : 0,
    getAudioCurrentTime
  );
  // 跟随屏幕背景亮暗自动切主题（仅弹幕窗启用，采样在 Rust 侧）
  const appearanceStyle = useDanmakuWindowAppearance();

  // 自动播放音频
  useEffect(() => {
    if (roomId && audioSettings.autoPlay) {
      void audioPlay();
    }
  }, [roomId, audioSettings.autoPlay, audioPlay]);

  // 未开播时自动播放失败会停在错误态；收到"开播了"系统行且开着自动播放则自动续播
  const lastLiveMarkerRef = useRef(0);
  useEffect(() => {
    const liveMarker = [...storeDanmakuMessages].reverse().find((m) => m.type === "live");
    if (!liveMarker || liveMarker.timestamp <= lastLiveMarkerRef.current) return;
    lastLiveMarkerRef.current = liveMarker.timestamp;
    if (roomId && audioSettings.autoPlay && !audioPlaying && !audioConnecting) {
      void audioPlay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeDanmakuMessages]);

  // 音频播放 + 已启用实时字幕 → 启动 STT；任一条件消失就停止（包括在弹幕窗设置里
  // 关掉字幕）。只加启动不加停止的话，关掉开关后识别仍在后台跑，字幕也不会消失。
  useEffect(() => {
    if (!sttAvailable) return;
    if (audioPlaying && sttSettings.enabled) {
      tauriCommands.stt.start().catch(() => {});
    } else {
      tauriCommands.stt.stop().catch(() => {});
    }
  }, [audioPlaying, sttAvailable, sttSettings.enabled]);

  // 字幕快捷开关的可用性：面板打开时才查一次模型目录（常驻窗口，不适合反复扫盘）
  const [subtitleModelReady, setSubtitleModelReady] = useState<boolean | null>(null);
  useEffect(() => {
    if (!settingsOpen || !sttAvailable) {
      setSubtitleModelReady(null);
      return;
    }
    let cancelled = false;
    tauriCommands.stt
      .listModels()
      .then((models) => {
        if (!cancelled) setSubtitleModelReady(models.includes(sttSettings.modelId));
      })
      .catch(() => {
        if (!cancelled) setSubtitleModelReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [settingsOpen, sttAvailable, sttSettings.modelId]);

  const subtitleHint = !sttAvailable
    ? translate("liveWindow.speechUnavailable")
    : subtitleModelReady === false
      ? translate("liveWindow.speechModelMissing")
      : sttSettings.enabled && !audioPlaying
        ? translate("liveWindow.speechStartAudio")
        : undefined;

  const handleAudioPlay = useCallback(async () => {
    await audioPlay();
  }, [audioPlay]);

  const handleAudioStop = useCallback(async () => {
    await audioStop();
    if (sttAvailable) {
      try { await tauriCommands.stt.stop(); } catch { /* ignore */ }
    }
  }, [audioStop, sttAvailable]);

  useEffect(() => {
    if (!sttAvailable) return;
    return () => {
      tauriCommands.stt.stop().catch(() => {});
    };
  }, [sttAvailable]);

  // 窗口尺寸持久化已迁移到 Rust 侧（app_metadata 表）；清理旧版 localStorage 里的物理像素脏数据
  useEffect(() => {
    localStorage.removeItem("danmaku-window-width");
    localStorage.removeItem("danmaku-window-height");
  }, []);

  const {
    isRunning: autoSendRunning,
    lastSentMessage,
    lastError: autoSendError,
    lastIndex,
    sentCount,
    stopReason,
    start: startAutoSend,
    stop: stopAutoSend
  } = useAutoSend(roomId);

  const {
    isRunning: likeIsRunning,
    sentTotal: likeSentTotal,
    targetTotal: likeTargetTotal,
    lastError: likeError,
    stopReason: likeStopReason,
    start: startAutoLike,
    stop: stopAutoLike,
  } = useAutoLike(roomId);

  // 循环发送（文字/表情）或自动点赞任一在跑，入口闪电都保持点亮
  const autoLoopRunning = autoSendRunning || likeIsRunning;

  // ── 消息分流 ──
  const giftMessages = useMemo(() => storeGiftMessages.filter((m) => {
    const isGiftType = (m.type === "gift" && showGift) ||
      (m.type === "superChat" && showSuperChat) ||
      (m.type === "guard" && showGuard);
    if (!isGiftType) return false;
    if (batteryFilter > 0) {
      // 电池筛选：10 电池 = 1 元。礼物 price 单位是金瓜子（1元=1000金瓜子），
      // SC 的 price 是人民币直传，两者口径不同需分开折算
      const yuan =
        m.type === "superChat" ? (m.price ?? 0) : ((m.price ?? 0) / 1000);
      return yuan * 10 >= batteryFilter;
    }
    return true;
  }), [storeGiftMessages, showGift, showSuperChat, showGuard, batteryFilter]);
  // 进场/点赞已拆分到活动栏（activityMessages），弹幕数组即所见
  const danmakuMessages = storeDanmakuMessages;
  const storeActivityMessages = useDanmakuStore((state) => state.activityMessages);
  const droppedActivity = useDanmakuStore((state) => state.droppedActivity);
  const activityBarMode = settings.appearance.activityBarMode;
  const activityMessages = useMemo(() => {
    const filter = settings.appearance.activityFilter;
    if (filter === "all") return storeActivityMessages;
    return storeActivityMessages.filter((m) => (filter === "entry" ? m.type === "entry" : m.type === "like"));
  }, [storeActivityMessages, settings.appearance.activityFilter]);
  const latestActivity = activityMessages.length > 0 ? activityMessages[activityMessages.length - 1] : null;
  const giftTotal = useMemo(() => {
    let total = 0;
    for (const m of storeGiftMessages) {
      if (m.type === "gift") {
        total += (m.price ?? 0) * (m.count ?? 1) / 1000; // 金瓜子 → 人民币
      } else if (m.type === "superChat") {
        total += m.price ?? 0; // SC price 已是人民币
      }
    }
    return total;
  }, [storeGiftMessages]);
  const giftSenderCount = useMemo(() => {
    const uids = new Set<number>();
    for (const m of storeGiftMessages) {
      if ((m.type === "gift" || m.type === "superChat") && m.uid) {
        uids.add(m.uid);
      }
    }
    return uids.size;
  }, [storeGiftMessages]);
  const anchorId = useMemo(() => {
    const room = rooms.find((item) => item.roomId === roomId);
    return room?.uid ?? 0;
  }, [rooms, roomId]);

  // ── 分割栏拖拽 ──
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const { ratio, setRatio, onDividerPointerDown, resetDivider } = useDividerDrag(splitContainerRef, { defaultRatio: 0.35 });
  // 第二分割栏：弹幕栏 / 活动栏 的比例（容器为下部块）
  const activitySplitRef = useRef<HTMLDivElement | null>(null);
  const { ratio: activityRatio, setRatio: setActivityRatio, onDividerPointerDown: onActivityDividerPointerDown, resetDivider: resetActivityDivider } = useDividerDrag(activitySplitRef, {
    storageKey: "activity-divider-ratio",
    defaultRatio: 0.94,
  });

  // ── 各栏自动滚动 ──
  const giftScroll = useAutoScroll(giftMessages);
  const danmakuScroll = useAutoScroll(danmakuMessages);
  const activityScroll = useAutoScroll(activityMessages);

  // ── 虚拟滚动：行高按类型估算，实际高度由 measureElement 动态回填 ──
  // 估计值必须＝真实行高：共享组件的 .danmaku-message 是 24px 行高 + 8px 下间距，
  // 外层包裹容器实测 offsetHeight 为 32px。原来的 30 比真实值小 2px，新挂载的行在
  // measureElement 回填前会先按偏小的高度排布，刷屏/滚动时一屏十几行就累积成
  // 二十几像素的上移，表现为「行与行压在一起」。
  const ROW_ESTIMATE_PX = 32;
  const messageKey = (m: DanmakuMessage) => `${m.roomId}-${m.id}-${m.timestamp}`;
  const giftVirtualizer = useVirtualizer({
    count: giftMessages.length,
    getScrollElement: () => giftScroll.scrollRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 10,
    getItemKey: (index) => messageKey(giftMessages[index]),
  });
  const danmakuVirtualizer = useVirtualizer({
    count: danmakuMessages.length,
    getScrollElement: () => danmakuScroll.scrollRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 10,
    getItemKey: (index) => messageKey(danmakuMessages[index]),
  });
  const activityVirtualizer = useVirtualizer({
    count: activityMessages.length,
    getScrollElement: () => activityScroll.scrollRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 10,
    getItemKey: (index) => messageKey(activityMessages[index]),
  });

  // 虚拟滚动下新行渲染后才会回填真实高度，总高度随之增长；贴底时跟随吸底，避免漂移
  useEffect(() => {
    if (giftScroll.isAtBottom) giftScroll.scrollToBottom();
  }, [giftVirtualizer.getTotalSize()]);
  useEffect(() => {
    if (danmakuScroll.isAtBottom) danmakuScroll.scrollToBottom();
  }, [danmakuVirtualizer.getTotalSize()]);
  useEffect(() => {
    if (activityScroll.isAtBottom) activityScroll.scrollToBottom();
  }, [activityVirtualizer.getTotalSize()]);

  // ── 列表滑窗裁剪 / 容器尺寸变化后的虚拟器自愈 ──
  // 两种情况都会让按 key 的行高缓存与实际渲染不符（滑窗索引移位、宽度变化导致
  // 文本重新换行），表现为行重叠/顶部空白。measure() 只清缓存不重触发行的
  // ref 测量，因此这里递增 epoch 编进行 key，强制可见行卸载重挂、完整重测量。
  const droppedDanmaku = useDanmakuStore((state) => state.droppedDanmaku);
  const droppedGift = useDanmakuStore((state) => state.droppedGift);
  const [listEpoch, setListEpoch] = useState(0);
  // 吸附展开后的 RO 抑制窗口：窗口放大瞬间容器尺寸变化会触发 epoch 重挂载，
  // 三列可见行全部卸载重测正好砸在滑入动画中间（展开卡顿的一个来源），故暂时忽略 RO
  const suppressRoUntilRef = useRef(0);
  useEffect(() => {
    if (!droppedDanmaku && !droppedGift && !droppedActivity) return;
    setListEpoch((epoch) => epoch + 1);
  }, [droppedDanmaku, droppedGift, droppedActivity]);
  // 各栏滚动位置补偿：贴底直接吸底；翻阅时按内容高度差回滚（双 rAF 等重挂载行完成测量）
  useEffect(() => {
    if (!droppedDanmaku) return;
    const container = danmakuScroll.scrollRef.current;
    const atBottom = danmakuScroll.isAtBottom;
    const sizeBefore = danmakuVirtualizer.getTotalSize();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!container) return;
        if (atBottom) {
          container.scrollTo({ top: container.scrollHeight });
        } else {
          const delta = sizeBefore - danmakuVirtualizer.getTotalSize();
          if (delta > 0) container.scrollTop = Math.max(0, container.scrollTop - delta);
        }
      }),
    );
  }, [droppedDanmaku]);
  useEffect(() => {
    if (!droppedGift) return;
    const container = giftScroll.scrollRef.current;
    const atBottom = giftScroll.isAtBottom;
    const sizeBefore = giftVirtualizer.getTotalSize();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!container) return;
        if (atBottom) {
          container.scrollTo({ top: container.scrollHeight });
        } else {
          const delta = sizeBefore - giftVirtualizer.getTotalSize();
          if (delta > 0) container.scrollTop = Math.max(0, container.scrollTop - delta);
        }
      }),
    );
  }, [droppedGift]);
  useEffect(() => {
    if (!droppedActivity) return;
    const container = activityScroll.scrollRef.current;
    const atBottom = activityScroll.isAtBottom;
    const sizeBefore = activityVirtualizer.getTotalSize();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!container) return;
        if (atBottom) {
          container.scrollTo({ top: container.scrollHeight });
        } else {
          const delta = sizeBefore - activityVirtualizer.getTotalSize();
          if (delta > 0) container.scrollTop = Math.max(0, container.scrollTop - delta);
        }
      }),
    );
  }, [droppedActivity]);
  useEffect(() => {
    const targets = [giftScroll.scrollRef.current, danmakuScroll.scrollRef.current, activityScroll.scrollRef.current].filter(
      (el): el is HTMLDivElement => el != null,
    );
    if (targets.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      // 吸附展开瞬间的容器变化不触发重挂载（抑制期见 suppressRoUntilRef 定义处）
      if (Date.now() < suppressRoUntilRef.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => setListEpoch((epoch) => epoch + 1), 200);
    });
    targets.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  usePanelDismiss({
    open: activePanel !== null || barMenuOpen,
    onClose: () => {
      setActivePanel(null);
      setBarMenuOpen(false);
    },
    ignoreRef: panelIgnoreRefs,
  });

  // ── 窗口透传：见 useDanmakuWindowModes 的 usePassthroughHitTest（两窗共用） ──

  const loadEmoticons = useCallback(async (forceAccountId?: string) => {
    if (!roomId) return;

    setLoadingEmoticons(true);
    setEmoticonError(null);

    const accountId = forceAccountId ?? activeAccountId ?? undefined;

    try {
      const [packages, favorites] = await Promise.all([
        tauriCommands.room.getEmoticons(roomId, false, accountId),
        tauriCommands.room.getFavoriteEmoticons(accountId ?? ""),
      ]);
      setEmoticonPkgMap((prev) => {
        const next = new Map(prev);
        next.set(accountId ?? "", packages);
        return next;
      });
      setFavoriteMap((prev) => {
        const next = new Map(prev);
        next.set(accountId ?? "", favorites);
        return next;
      });
      setActivePkgKey((current) => {
        if (current && (current === FAVORITE_PKG_KEY || packages.some((pkg) => makePkgKey(pkg) === current))) {
          return current;
        }
        return packages[0] ? makePkgKey(packages[0]) : null;
      });
    } catch (error) {
      setEmoticonError(error instanceof Error ? error.message : desktopI18n.t("desktop:liveWindow.loadEmotesFailed"));
    } finally {
      setLoadingEmoticons(false);
    }
  }, [roomId, activeAccountId]);

  // 当发送账号变化时，如果当前账号没有缓存的表情包，自动加载
  useEffect(() => {
    if (!roomId || !emoticonPickerOpen) return;
    const key = effectiveSendingId ?? "";
    if (!emoticonPkgMap.has(key) && !loadingEmoticons) {
      void loadEmoticons();
    }
  }, [effectiveSendingId, roomId, emoticonPickerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleEmoticonPicker = useCallback(async () => {
    const nextOpen = !emoticonPickerOpen;
    togglePanel(PANEL.EMOTICON);

    if (nextOpen && emoticonPackages.length === 0 && !loadingEmoticons) {
      await loadEmoticons();
    }
  }, [emoticonPackages.length, emoticonPickerOpen, loadEmoticons, loadingEmoticons, togglePanel]);

  const [sendError, setSendError] = useState<string | null>(null);
  const [sendErrorKey, setSendErrorKey] = useState(0);
  const [fullscreenInputActive, setFullscreenInputActive] = useState(false);
  const sendButton = useRef<HTMLButtonElement>(null);
  const fullscreenSessionKey = `${roomId ?? ""}:${activeAccountId ?? ""}`;

  const handleSend = async (draft = message) => {
    if (!roomId || !draft.trim()) return;
    const text = draft.trim().slice(0, 40);
    try {
      await send(roomId, text);
      setMessage((current) => current === draft ? "" : current);
      setSendError(null);
    } catch (error) {
      // 从 danmaku store 获取错误消息（useDanmaku 已经设置了）
      const storeError = useDanmakuStore.getState().lastError;
      setSendError(storeError ?? translate("liveWindow.sendFailed"));
      setSendErrorKey((k) => k + 1);
    }
  };

  const handleMention = useCallback((username: string) => {
    setMessage(`@${username} `);
  }, []);

  const handleSendText = useCallback(
    async (text: string) => {
      if (!roomId || !text.trim()) return;
      await send(roomId, text.trim().slice(0, 40));
    },
    [roomId, send]
  );

  const handleSendEmoticon = useCallback(
    async (emoticon: Emoticon) => {
      if (!roomId || !emoticon.emoticonUnique || (emoticon.perm ?? 1) === 0) return;

      await sendEmoticon(roomId, emoticon.emoticonUnique, serializeEmoticonOptions(emoticon));
      setActivePanel(null);
    },
    [roomId, sendEmoticon]
  );

  // 收藏/取消收藏表情
  const handleToggleFavorite = useCallback(
    async (emoticon: Emoticon) => {
      const accountId = effectiveSendingId;
      const unique = emoticon.emoticonUnique;
      if (!accountId || !unique) return;

      const isFav = currentFavorites.some((e) => e.emoticonUnique === unique);
      try {
        if (isFav) {
          await tauriCommands.room.removeFavoriteEmoticon(accountId, unique);
          setFavoriteMap((prev) => {
            const next = new Map(prev);
            next.set(accountId, (next.get(accountId) ?? []).filter((e) => e.emoticonUnique !== unique));
            return next;
          });
        } else {
          await tauriCommands.room.addFavoriteEmoticon(accountId, emoticon);
          setFavoriteMap((prev) => {
            const next = new Map(prev);
            next.set(accountId, [...(next.get(accountId) ?? []), emoticon]);
            return next;
          });
        }
      } catch (err) {
        console.error("收藏操作失败:", err);
      }
    },
    [effectiveSendingId, currentFavorites]
  );

  // ── 分割栏是否折叠 ──
  const showGifts = ratio > 0.02;
  const showDanmaku = ratio < 0.98;

  const bgAlpha = opacity / 100;
  // 仅输入框模式的描边强度跟背景不透明度反向联动：不透明度越高（窗口越实）描边越浅，
  // 越低（越透）描边越深。紧凑栏本身没有底色，描边是唯一的视觉边界，所以留 0.15 作为下限
  const inputOnlyRingAlpha = Math.round((0.15 + (1 - bgAlpha) * 0.3) * 100) / 100;

  // 空白区域拖动页面：仅当左键直接点在容器自身空白（非子元素、非滚动条）时才拖动。
  // 滚动条不属于任何子元素，e.target 也是容器本身，因此必须额外排除落在滚动条上的点击，
  // 否则拖动滚动条会被误判为拖动页面。
  const handleBlankAreaMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>, locked: boolean, passthrough: boolean) => {
    if (locked || passthrough || e.button !== 0) return;
    if (e.target !== e.currentTarget) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    // 滚动条实际宽度 = offsetWidth(含滚动条+边框) - clientWidth(含 padding，不含滚动条)。
    // 只排除滚动条真正占据的那一段 [rect.right - sb, rect.right]，不牵连 padding，
    // 这样判定宽度与滚动条实际宽度一致（经典与 overlay 滚动条都适用，overlay 时 sb=0）。
    const vScrollWidth = el.offsetWidth - el.clientWidth;
    if (vScrollWidth > 0 && e.clientX >= rect.right - vScrollWidth) return;
    const hScrollHeight = el.offsetHeight - el.clientHeight;
    if (hScrollHeight > 0 && e.clientY >= rect.bottom - hScrollHeight) return;
    void appWindow.startDragging();
  }, []);

  // 侧边吸附的收缩条与滑入/滑出动画已抽进共享的 DanmakuWindow 组件
  // （直播与视频弹幕窗两种内容形态共用同一实现），本页只用 phase 做滚动归位
  const { phase: dockPhase } = useWindowDock();
  const prevDockPhaseRef = useRef(dockPhase);

  // 从吸附收起状态展开时，强制滚动到最新弹幕；进入展开态时同时抑制展开瞬间
  // 容器 ResizeObserver 触发的 epoch 重挂载（见 suppressRoUntilRef 定义处）
  useEffect(() => {
    const prev = prevDockPhaseRef.current;
    prevDockPhaseRef.current = dockPhase;
    if (dockPhase === "expanded" && prev !== "expanded") {
      suppressRoUntilRef.current = Date.now() + 600;
    }
    if (prev === "collapsed" && (dockPhase === "expanded" || dockPhase === "normal")) {
      // 等容器挂载完成后再滚
      requestAnimationFrame(() => {
        danmakuScroll.scrollToBottom();
        giftScroll.scrollToBottom();
        activityScroll.scrollToBottom();
      });
    }
  }, [dockPhase, danmakuScroll, giftScroll, activityScroll]);

  return (
    <>
    {/* audio 元素通过 portal 挂载到 body，跨 dockPhase / 仅输入框模式切换时不会被 React 卸载，避免 mpegts 断流 */}
    {createPortal(<audio ref={audioRef} className="hidden" />, document.body)}
    <DanmakuWindow
      className="danmaku-bg-main select-none"
      style={{ ...appearanceStyle, "--bg-a": bgAlpha } as React.CSSProperties}
      title={displayRoomInfo ? `${displayRoomInfo.uname} - ${displayRoomInfo.title}` : t("room", { id: roomId ?? "" })}
      exitLabel={t("exitRoom")}
      onExit={async () => {
        // 断开连接，最多等 1 秒
        const timeout = new Promise((r) => setTimeout(r, 1000));
        await Promise.race([
          tauriCommands.ws.disconnect().catch(() => {}),
          timeout,
        ]);
        if (sttAvailable) {
          tauriCommands.stt.stop().catch(() => {});
        }
        if (roomId !== null) {
          // exit_room 销毁弹幕/抽屉窗口并按设置恢复主窗口
          tauriCommands.room.exitRoom(roomId).catch(() => {
            // exit_room 失败时兜底本地销毁，避免窗口残留
            appWindow.destroy().catch(() => {});
          });
        } else {
          void appWindow.destroy();
        }
      }}
      inputOnly={{
        active: inputOnly,
        onToggle: toggleInputOnly,
        barStyle: appearanceStyle,
        renderBar: ({ locked }) => (
          <>
            {/* 紧凑栏没有底色，输入框只靠一圈中性浅灰描边划出边界；描边深浅由 --field-ring-a
                跟着「不透明度」设置走：设置越高（窗口越实）描边越浅，越低（越透）描边越深 */}
            <DanmakuInput value={message} onChange={setMessage} onSend={(draft) => void handleSend(draft)} maxLength={40}
              fullscreenSessionKey={fullscreenSessionKey} onFullscreenInputActiveChange={setFullscreenInputActive}
              aria-label={t("sendLive")} disabled={isAnonymous}
              style={{ "--field-ring-a": inputOnlyRingAlpha } as React.CSSProperties}
              className="min-w-0 flex-1 rounded bg-transparent px-2 py-1.5 text-sm outline-none ring-1 ring-inset ring-[rgb(148_163_184_/_var(--field-ring-a))] focus:ring-brand/70"
            />
            {/* 拖动 + 恢复完整窗口二合一：按住移动超过 4px 就走系统拖动，
                松手前没产生位移就算一次点击，回到完整窗口 */}
            <button
              type="button"
              onMouseDown={(event) => handleInputOnlyGrip(event, locked)}
              className="flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded bg-black/5 text-ink-muted transition hover:bg-black/10 hover:text-ink active:cursor-grabbing dark:bg-white/10 dark:hover:bg-white/[0.18]"
              title={t(locked ? "restoreLockedHint" : "restoreDragHint")}
              aria-label={t("restoreWindow")}
            >
              {/* 必须是看得见的图标：紧凑栏没有底色，一根 25% 透明度的细竖条在桌面上等于隐形 */}
              <Expand className="h-3.5 w-3.5" />
            </button>
          </>
        ),
      }}
      switcher={<RoomSwitcher roomId={roomId} />}
      audio={{
        playing: audioPlaying, loading: audioConnecting, disabled: !roomId, error: audioError,
        volume: audioVolume * 100, muted: audioMuted,
        playLabel: t("playAudio"), pauseLabel: t("stopAudio"),
        onTogglePlay: () => { void (audioPlaying ? handleAudioStop() : handleAudioPlay()); },
        onToggleMute: () => {
          if (audioMuted) audioToggleMute();
          else if (audioVolume === 0) audioSetVolume(audioSettings.defaultVolume / 100);
          else audioToggleMute();
        },
        onVolumeChange: (volume) => { if (audioMuted) audioToggleMute(); audioSetVolume(volume / 100); },
        status: (<span className="ml-auto flex items-center gap-3 text-[11px] text-ink-muted">
          {wsStatus === "connecting" || wsStatus === "reconnecting" || wsStatus === "error" ? (
            <span role="status" title={wsError ?? undefined}>
              {translate(wsStatus === "error" ? "liveWindow.connectionError" : `liveWindow.${wsStatus}`)}
            </span>
          ) : null}
          {danmakuCount > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {danmakuCount}
            </span>
          )}
          {giftTotal > 0 && (
            <span className="flex items-center gap-1">
              <Gift className="h-3 w-3" />
              {formatNumber(giftTotal, { style: "currency", currency: "CNY", currencyDisplay: "narrowSymbol" })}
              {superChatCount > 0 && (
                <span className="text-ink-muted">({superChatCount}SC)</span>
              )}
              {guardCount > 0 && (
                <span className="text-ink-muted">({translate("liveWindow.guardCount", { count: guardCount })})</span>
              )}
            </span>
          )}
          {liveDuration && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {liveDuration}
            </span>
          )}
          {onlineCount > 0 && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {formatNumber(onlineCount, { notation: "compact", maximumFractionDigits: 1 })}
            </span>
          )}
          {watchedCount > 0 && (
            <span className="flex items-center gap-1" title={translate("liveWindow.watched")}>
              <Eye className="h-3 w-3" />
              {formatNumber(watchedCount, { notation: "compact", maximumFractionDigits: 1 })}
            </span>
          )}
          {totalLikeCount > 0 && (
            <span className="flex items-center gap-1">
              <ThumbsUp className="h-3 w-3" />
              {formatNumber(totalLikeCount, { notation: "compact", maximumFractionDigits: 1 })}
            </span>
          )}
        </span>),
      }}
      footer={
        /* 发送栏 */
        <div data-interactive="" className="danmaku-bg-panel relative px-3 py-2">
          {sendError && (
            <InlineMessage key={sendErrorKey} type="error" className="mb-2">{sendError}</InlineMessage>
          )}

          {/* 功能按钮行（compact 模式收纳进输入行左侧的 + 菜单） */}
          <div ref={inputBarRef} className={`${compactBar ? "hidden" : "mb-2 flex"} items-center gap-2`}>
            <button
              type="button"
              onClick={() => { if (!isAnonymous) togglePanel(PANEL.AUTO_SEND); }}
              disabled={isAnonymous}
              title={isAnonymous ? translate("liveWindow.anonymousUnavailable") : translate("liveWindow.autoSend")}
              className={`rounded inline-flex items-center p-1.5 text-xs transition ${
                isAnonymous ? "cursor-not-allowed opacity-40"
                  : autoLoopRunning ? "danmaku-btn-active text-brand"
                  : activePanel === PANEL.AUTO_SEND ? "bg-brand/10 text-brand"
                  : "danmaku-bg-bar text-ink-muted hover:bg-[#ebebeb] text-ink dark:hover:bg-white/[0.04]"
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => { if (!isAnonymous) void handleToggleEmoticonPicker(); }}
              disabled={isAnonymous}
              title={isAnonymous ? translate("liveWindow.anonymousUnavailable") : translate("liveWindow.emotes")}
              className={`rounded inline-flex items-center p-1.5 text-xs transition ${
                isAnonymous ? "cursor-not-allowed opacity-40"
                  : activePanel === PANEL.EMOTICON ? "bg-brand/10 text-brand"
                  : "danmaku-bg-bar text-ink-muted hover:bg-[#ebebeb] text-ink dark:hover:bg-white/[0.04]"
              }`}
            >
              <Smile className="h-3.5 w-3.5" />
            </button>
            {giftSendEnabled && (
              <button
                type="button"
                onClick={() => { if (!isAnonymous) togglePanel(PANEL.GIFT); }}
                disabled={isAnonymous}
                title={isAnonymous ? translate("liveWindow.anonymousUnavailable") : translate("liveWindow.sendGift")}
                className={`rounded inline-flex items-center p-1.5 text-xs transition ${
                  isAnonymous ? "cursor-not-allowed opacity-40"
                    : activePanel === PANEL.GIFT ? "bg-brand/10 text-brand"
                    : "danmaku-bg-bar text-ink-muted hover:bg-[#ebebeb] text-ink dark:hover:bg-white/[0.04]"
                }`}
              >
                <Gift className="h-3.5 w-3.5" />
              </button>
            )}
            <AccountSwitcher viewingAccountId={activeAccountId} />
            <button
              type="button"
              onClick={() => togglePanel(PANEL.FILTER)}
              title={translate("liveWindow.filters")}
              className={`danmaku-bg-bar rounded inline-flex items-center p-1.5 text-xs transition ${
                activePanel === PANEL.FILTER ? "bg-brand/10 text-brand"
                  : "text-ink-muted hover:bg-[#ebebeb] text-ink dark:hover:bg-white/[0.04]"
              }`}
            >
              <ShieldBan className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => togglePanel(PANEL.SETTINGS)}
              title={translate("liveWindow.settings")}
              className={`danmaku-bg-bar rounded inline-flex items-center p-1.5 text-xs transition ${
                activePanel === PANEL.SETTINGS ? "bg-brand/10 text-brand"
                  : "text-ink-muted hover:bg-[#ebebeb] text-ink dark:hover:bg-white/[0.04]"
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => togglePanel(PANEL.CLIPBOARD)}
              title={translate("liveWindow.quickMessages")}
              className={`danmaku-bg-bar rounded inline-flex items-center p-1.5 text-xs transition ${
                activePanel === PANEL.CLIPBOARD ? "bg-brand/10 text-brand"
                  : "text-ink-muted hover:bg-[#ebebeb] text-ink dark:hover:bg-white/[0.04]"
              }`}
            >
              <ClipboardList className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 弹幕输入行 */}
          <div className="danmaku-bg-bar rounded flex items-center pr-1">
            {compactBar && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setBarMenuOpen((v) => !v)}
                  title={translate("liveWindow.more")}
                  aria-expanded={barMenuOpen}
                  className={`ml-1 flex h-7 w-7 items-center justify-center rounded transition ${
                    barMenuOpen ? "bg-brand/10 text-brand" : "text-ink-muted hover:bg-[#ebebeb] hover:text-ink dark:hover:bg-white/[0.06]"
                  }`}
                >
                  <Plus className={`h-4 w-4 transition-transform ${barMenuOpen ? "rotate-45" : ""}`} />
                </button>
                {barMenuOpen && (
                  <PanelShell
                    variant="menu"
                    hideHeader
                    ariaLabel={translate("liveWindow.more")}
                    className="absolute bottom-full left-0 z-30 mb-1"
                  >
                    <div className="flex items-center gap-1">
                      {[
                        { key: PANEL.AUTO_SEND, label: translate("liveWindow.autoSend"), Icon: Zap, disabled: isAnonymous },
                        { key: PANEL.EMOTICON, label: translate("liveWindow.emotes"), Icon: Smile, disabled: isAnonymous },
                        ...(giftSendEnabled
                          ? [{ key: PANEL.GIFT, label: translate("liveWindow.gifts"), Icon: Gift, disabled: isAnonymous }]
                          : []),
                        { key: PANEL.FILTER, label: translate("liveWindow.filters"), Icon: ShieldBan, disabled: false },
                        { key: PANEL.SETTINGS, label: translate("liveWindow.settings"), Icon: Settings, disabled: false },
                        { key: PANEL.CLIPBOARD, label: translate("liveWindow.quickMessages"), Icon: ClipboardList, disabled: false },
                      ].map(({ key, label, Icon, disabled }) => (
                        <button
                          key={key}
                          type="button"
                          disabled={disabled}
                          title={label}
                          onClick={() => {
                            if (key === PANEL.EMOTICON) void handleToggleEmoticonPicker();
                            else togglePanel(key);
                            setBarMenuOpen(false);
                          }}
                          className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
                            disabled ? "cursor-not-allowed opacity-40"
                              : key === PANEL.AUTO_SEND && autoLoopRunning ? "danmaku-btn-active text-brand"
                              : activePanel === key ? "bg-brand/10 text-brand"
                              : "text-ink-muted hover:bg-[var(--panel-hover)] hover:text-ink"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </button>
                      ))}
                    </div>
                  </PanelShell>
                )}
              </div>
            )}
            <DanmakuInput multiline value={message} onChange={setMessage} onSend={(draft) => void handleSend(draft)} maxLength={40}
              fullscreenSessionKey={fullscreenSessionKey} onFullscreenInputActiveChange={setFullscreenInputActive}
              fullscreenSubmit={{ button: sendButton, label: translate("liveWindow.send") }}
              aria-label={t("sendLive")} disabled={isAnonymous}
              placeholder={isAnonymous ? translate("liveWindow.anonymousCannotSend") : translate("liveWindow.input")}
              className={`min-h-[40px] flex-1 resize-none bg-transparent py-2.5 pl-3 pr-0 text-sm outline-none ${
                isAnonymous ? "cursor-not-allowed text-ink-muted placeholder:text-ink-muted" : "text-ink placeholder:text-ink-muted"
              }`}
              style={{ maxHeight: "120px" }}
            />
              <button
                ref={sendButton}
                onClick={() => { if (!fullscreenInputActive) void handleSend(); }}
                disabled={!roomId || sending || isAnonymous || (!fullscreenInputActive && !message.trim())}
                className={`m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded transition ${
                  isAnonymous
                    ? "cursor-not-allowed text-ink-muted opacity-40"
                    : "text-brand hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-brand/10"
                }`}
                title={isAnonymous ? translate("liveWindow.anonymousUnavailable") : sending ? translate("liveWindow.sending") : translate("liveWindow.send")}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
      }
    >
      {(win) => (
      <>
      {/* 上方区域：礼物 + 分割栏 + 弹幕 — 始终渲染三栏，折叠时 flex=0 但分割栏仍可拖拽恢复 */}
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={splitContainerRef} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">

        {/* 礼物栏 — 始终渲染，flex=ratio 控制大小 */}
        <div className="relative flex min-h-0 flex-col overflow-hidden" style={{ flex: ratio }}>
          {showGifts && (
            <>
              <div data-interactive="" className="flex shrink-0 items-center gap-1 px-2.5 py-1">
                {showBatteryFilter ? (
                  <div className="flex w-full items-center gap-1">
                    <span className="shrink-0 text-xs text-ink-muted">{translate("liveWindow.batteryMinimum")}</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={batteryInput}
                      onChange={(e) => setBatteryInput(e.target.value.replace(/\D/g, ""))}
                      placeholder="0"
                      className="h-5 min-w-0 flex-1 appearance-none rounded border border-neutral-200 bg-[#f8f8f8] px-1.5 text-xs text-ink-muted outline-none focus:ring-2 focus:ring-brand/30 dark:border-neutral-700 dark:bg-[#1a1c24] text-ink"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = Math.max(0, Math.floor(Number(batteryInput) || 0));
                        setBatteryFilter(val);
                        setShowBatteryFilter(false);
                      }}
                      className="shrink-0 rounded px-1.5 py-0.5 text-xs text-brand transition hover:bg-brand/10"
                    >
                      {translate("liveWindow.confirm")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBatteryFilter(0);
                        setBatteryInput("");
                        setShowBatteryFilter(false);
                      }}
                      className="shrink-0 rounded px-1.5 py-0.5 text-xs text-ink-muted transition hover:bg-[#ebebeb] dark:hover:bg-white/[0.04]"
                    >
                      {translate("liveWindow.cancel")}
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowGift((v) => !v)}
                      className={`rounded px-1.5 py-0.5 text-xs transition ${showGift ? "bg-brand/10 text-brand" : "text-ink-muted"} hover:bg-[#ebebeb] dark:hover:bg-white/[0.04]`}
                    >
                      {translate("liveWindow.giftFilter")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGuard((v) => !v)}
                      className={`rounded px-1.5 py-0.5 text-xs transition ${showGuard ? "bg-brand/10 text-brand" : "text-ink-muted"} hover:bg-[#ebebeb] dark:hover:bg-white/[0.04]`}
                    >
                      {translate("liveWindow.guardFilter")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSuperChat((v) => !v)}
                      className={`rounded px-1.5 py-0.5 text-xs transition ${showSuperChat ? "bg-brand/10 text-brand" : "text-ink-muted"} hover:bg-[#ebebeb] dark:hover:bg-white/[0.04]`}
                    >
                      {translate("liveWindow.superChat")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBatteryFilter(true)}
                      className={`ml-auto inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs transition ${batteryFilter > 0 ? "bg-brand/10 text-brand" : "text-ink-muted"} hover:bg-[#ebebeb] dark:hover:bg-white/[0.04]`}
                      title={translate("liveWindow.filterByPrice")}
                    >
                      {translate("liveWindow.priceFilter")}
                    </button>
                  </>
                )}
              </div>
              <div
                ref={giftScroll.attachScrollRef}
                onScroll={giftScroll.checkAtBottom}
                onMouseDown={(event) => handleBlankAreaMouseDown(event, win.locked, win.passthrough)}
                className="relative min-h-0 flex-1 overflow-y-auto pt-2.5 pr-2.5 pb-1 pl-1"
                style={{ fontSize: `${fontSize}px` }}
              >
                {giftMessages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-ink-muted select-none pointer-events-none">
                    {translate("liveWindow.noGifts")}
                  </div>
                ) : (
                  <div
                    key={`gift-${listEpoch}`}
                    className="pointer-events-none relative w-full"
                    style={{ height: giftVirtualizer.getTotalSize() }}
                  >
                    {giftVirtualizer.getVirtualItems().map((virtualItem) => {
                      const item = giftMessages[virtualItem.index];
                      return (
                        <div
                          key={`${listEpoch}-${virtualItem.key}`}
                          data-index={virtualItem.index}
                          ref={giftVirtualizer.measureElement}
                          className="absolute top-0 left-0 w-full"
                          style={{ transform: `translateY(${virtualItem.start}px)` }}
                        >
                          <DanmakuMessageItem
                            item={item}
                            fontSize={fontSize}
                            cachedEmotUrls={cachedEmotUrls}
                            onMention={handleMention}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {!giftScroll.isAtBottom && (
                <button
                  data-interactive=""
                  onClick={giftScroll.scrollToBottom}
                  className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full bg-black/30 px-2.5 py-1 text-white/85 backdrop-blur-sm transition hover:bg-black/45 hover:text-white dark:bg-white/15 dark:hover:bg-white/25"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </div>

        {/* 分割栏 — 始终渲染，可拖拽/键盘调整/双击重置 */}
        <div
          data-interactive=""
          role="separator"
          aria-orientation="horizontal"
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
          onPointerDown={onDividerPointerDown}
          onDoubleClick={() => resetDivider()}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setRatio((r: number) => Math.min(1, r + 0.05));
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setRatio((r: number) => Math.max(0, r - 0.05));
            }
          }}
          className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          <div className="h-px w-full bg-subtle transition-all group-hover:h-0.5 group-hover:bg-brand/50 dark:bg-white/[0.08] dark:group-hover:bg-brand/35" />
        </div>

        {/* 弹幕 + 活动 下部块 — flex=1-ratio 控制大小 */}
        <div ref={activitySplitRef} className="flex min-h-0 flex-col" style={{ flex: 1 - ratio }}>
          {/* 弹幕栏 */}
          <div className="relative min-h-0 overflow-hidden" style={{ flex: activityBarMode === "scroll" ? activityRatio : 1 }}>
            {showDanmaku && (
              <>
                <div
                  ref={danmakuScroll.attachScrollRef}
                  onScroll={danmakuScroll.checkAtBottom}
                  onMouseDown={(event) => handleBlankAreaMouseDown(event, win.locked, win.passthrough)}
                  onContextMenu={(e) => {
                    // 生产环境禁用空白区域右键菜单，开发环境保留（可检查元素）
                    if (!import.meta.env.DEV && e.target === e.currentTarget) {
                      e.preventDefault();
                    }
                  }}
                  className="h-full overflow-y-auto px-2.5 py-1"
                  style={{ fontSize: `${fontSize}px` }}
                >
                  {danmakuMessages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-xs text-ink-muted select-none pointer-events-none">
                      {t("noMessages")}
                    </div>
                  ) : (
                    <div
                      key={`danmaku-${listEpoch}`}
                      className="pointer-events-none relative w-full"
                      style={{ height: danmakuVirtualizer.getTotalSize() }}
                    >
                      {danmakuVirtualizer.getVirtualItems().map((virtualItem) => {
                        const item = danmakuMessages[virtualItem.index];
                        return (
                          <div
                            key={`${listEpoch}-${virtualItem.key}`}
                            data-index={virtualItem.index}
                            ref={danmakuVirtualizer.measureElement}
                            className="absolute top-0 left-0 w-full"
                            style={{ transform: `translateY(${virtualItem.start}px)` }}
                          >
                            <DanmakuMessageItem item={item} fontSize={fontSize} cachedEmotUrls={cachedEmotUrls} onMention={handleMention} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {!danmakuScroll.isAtBottom && (
                  <button
                    data-interactive=""
                    onClick={danmakuScroll.scrollToBottom}
                    className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full bg-black/30 px-2.5 py-1 text-white/85 backdrop-blur-sm transition hover:bg-black/45 hover:text-white dark:bg-white/15 dark:hover:bg-white/25"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
          </div>

          {/* 第二分割栏（弹幕栏 / 活动栏）— 仅滚动模式渲染 */}
          {activityBarMode === "scroll" && (
            <div
              data-interactive=""
              role="separator"
              aria-orientation="horizontal"
              aria-valuenow={Math.round(activityRatio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
              onPointerDown={onActivityDividerPointerDown}
              onDoubleClick={resetActivityDivider}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActivityRatio((r: number) => Math.min(1, r + 0.05));
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActivityRatio((r: number) => Math.max(0, r - 0.05));
                }
              }}
              className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            >
              <div className="h-px w-full bg-subtle transition-all group-hover:h-0.5 group-hover:bg-brand/50 dark:bg-white/[0.08] dark:group-hover:bg-brand/35" />
            </div>
          )}

          {/* 活动栏（进场/点赞）— 三态：scroll 可拖拽滚动 / latest 固定一行 / hidden 隐藏 */}
          {activityBarMode !== "hidden" && (
            <div
              className="relative flex shrink-0 flex-col overflow-hidden"
              style={activityBarMode === "latest" ? { height: 32 } : { flex: 1 - activityRatio, minHeight: 0 }}
            >
              {activityBarMode === "latest" ? (
                <div
                  className="danmaku-activity-latest flex h-full items-center overflow-hidden px-2.5"
                  onMouseDown={(event) => handleBlankAreaMouseDown(event, win.locked, win.passthrough)}
                  onContextMenu={(e) => {
                    if (!import.meta.env.DEV && e.target === e.currentTarget) {
                      e.preventDefault();
                    }
                  }}
                >
                  {latestActivity ? (
                    <div className="w-full pointer-events-none">
                      <DanmakuMessageItem item={latestActivity} fontSize={fontSize} cachedEmotUrls={cachedEmotUrls} onMention={handleMention} />
                    </div>
                  ) : (
                    <span className="text-xs text-ink-muted select-none pointer-events-none">
                      {translate("liveWindow.noActivity")}
                    </span>
                  )}
                </div>
              ) : (
                <>
                  {/* 内容过滤 — 与礼物栏过滤按钮同款式、同位置（栏内顶部左侧） */}
                  <div data-interactive="" className="flex shrink-0 items-center gap-1 px-2.5 py-1">
                    {([
                      ["all", translate("liveWindow.all")],
                      ["entry", translate("liveWindow.entries")],
                      ["like", translate("liveWindow.likes")],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => commitSettings({ appearance: { ...settings.appearance, activityFilter: value } })}
                        className={`rounded px-1.5 py-0.5 text-xs transition ${
                          settings.appearance.activityFilter === value
                            ? "bg-brand/10 text-brand"
                            : "text-ink-muted"
                        } hover:bg-[#ebebeb] dark:hover:bg-white/[0.04]`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div
                    ref={activityScroll.attachScrollRef}
                    onScroll={activityScroll.checkAtBottom}
                    onMouseDown={(event) => handleBlankAreaMouseDown(event, win.locked, win.passthrough)}
                    onContextMenu={(e) => {
                      if (!import.meta.env.DEV && e.target === e.currentTarget) {
                        e.preventDefault();
                      }
                    }}
                    className="relative min-h-0 flex-1 overflow-y-auto px-2.5 py-1"
                    style={{ fontSize: `${fontSize}px` }}
                  >
                    {activityMessages.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-xs text-ink-muted select-none pointer-events-none">
                        {translate("liveWindow.noActivity")}
                      </div>
                    ) : (
                      <div
                        key={`activity-${listEpoch}`}
                        className="pointer-events-none relative w-full"
                        style={{ height: activityVirtualizer.getTotalSize() }}
                      >
                        {activityVirtualizer.getVirtualItems().map((virtualItem) => {
                          const item = activityMessages[virtualItem.index];
                          return (
                            <div
                              key={`${listEpoch}-${virtualItem.key}`}
                              data-index={virtualItem.index}
                              ref={activityVirtualizer.measureElement}
                              className="absolute top-0 left-0 w-full"
                              style={{ transform: `translateY(${virtualItem.start}px)` }}
                            >
                              <DanmakuMessageItem item={item} fontSize={fontSize} cachedEmotUrls={cachedEmotUrls} onMention={handleMention} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {!activityScroll.isAtBottom && (
                    <button
                      data-interactive=""
                      onClick={activityScroll.scrollToBottom}
                      className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full bg-black/30 px-2.5 py-1 text-white/85 backdrop-blur-sm transition hover:bg-black/45 hover:text-white dark:bg-white/15 dark:hover:bg-white/25"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* 关掉字幕开关时立即隐藏：不等识别队列自然淡出，否则最后半句会再挂一会儿 */}
        {sttAvailable && sttSettings.enabled && <SubtitleOverlay text={sttText} isSpeaking={sttSpeaking} />}
      </div>

      {/* 浮动面板（覆盖在内容区上方） */}
      {activePanel && (
      <div ref={panelHostRef} className="absolute inset-x-0 bottom-0 z-20">
        {settingsOpen && (
          <FloatingPanel title={translate("liveWindow.appearance")} onClose={() => setActivePanel(null)}>
            <DanmakuWindowAppearanceSettings>
              <div className="space-y-1">
                <OpacitySlider
                  value={opacity}
                  onChange={(val) => commitSettings({ appearance: { opacity: val } } as Partial<SettingsType>)}
                  className="min-h-[28px] py-0.5"
                  labelClassName="panel-row-label"
                  valueClassName="panel-field-value w-9 text-right"
                />

                {/* 实时字幕：与 设置 → 实时字幕 → 启用语音识别 是同一项，
                    放在这里是为了看直播时不用为了关字幕跑回主窗口 */}
                <PanelRow label={translate("liveWindow.captions")} hint={subtitleHint}>
                  <PanelSegmented
                    ariaLabel={translate("liveWindow.captions")}
                    items={[
                      {
                        value: "on" as const,
                        label: translate("liveWindow.on"),
                        // 只在「打开」时要求可用，避免模型缺失时连关都关不掉
                        disabled: !sttAvailable || subtitleModelReady === false,
                        title: subtitleHint,
                      },
                      { value: "off" as const, label: translate("liveWindow.off") },
                    ]}
                    value={settings.stt.enabled ? "on" : "off"}
                    onChange={(value) =>
                      commitSettings({ stt: { ...settings.stt, enabled: value === "on" } })
                    }
                  />
                </PanelRow>

                <PanelRow label={translate("liveWindow.emoteStyle")}>
                  <PanelSegmented
                    ariaLabel={translate("liveWindow.emoteStyle")}
                    items={[
                      { value: "hidden" as const, label: translate("liveWindow.hidden") },
                      { value: "text" as const, label: translate("liveWindow.text") },
                      { value: "image" as const, label: translate("liveWindow.image") },
                    ]}
                    value={settings.appearance.emoticonStyle}
                    onChange={(value) =>
                      commitSettings({
                        appearance: { ...settings.appearance, emoticonStyle: value },
                      })
                    }
                  />
                </PanelRow>

                {/* 礼物图标：仅礼物打赏功能启用（gift-send 构建）时显示 */}
                {giftSendEnabled && (
                  <PanelRow label={translate("liveWindow.giftIcons")}>
                    <PanelSegmented
                      ariaLabel={translate("liveWindow.giftIcons")}
                      items={[
                        { value: "show" as const, label: translate("liveWindow.show") },
                        { value: "hide" as const, label: translate("liveWindow.hidden") },
                      ]}
                      value={(settings.appearance.showGiftIcons ?? true) ? "show" : "hide"}
                      onChange={(value) =>
                        commitSettings({
                          appearance: { ...settings.appearance, showGiftIcons: value === "show" },
                        })
                      }
                    />
                  </PanelRow>
                )}

                <PanelRow label={translate("liveWindow.dockAnimation")}>
                  <PanelSegmented
                    ariaLabel={translate("liveWindow.dockSpeed")}
                    items={[
                      { value: "350" as const, label: translate("liveWindow.slow") },
                      { value: "220" as const, label: translate("liveWindow.normal") },
                      { value: "120" as const, label: translate("liveWindow.fast") },
                      { value: "0" as const, label: translate("liveWindow.noAnimation") },
                    ]}
                    value={String(settings.appearance.dockAnimMs)}
                    onChange={(value) =>
                      commitSettings({ appearance: { dockAnimMs: Number(value) } } as Partial<SettingsType>)
                    }
                  />
                </PanelRow>

                <PanelSection title={translate("liveWindow.hideElements")}>
                  <div className="flex flex-wrap gap-1.5">
                    {HIDE_APPEARANCE_KEYS.map((key) => (
                      <PanelChip
                        key={key}
                        selected={settings.appearance[key]}
                        onClick={() =>
                          commitSettings({
                            appearance: { ...settings.appearance, [key]: !settings.appearance[key] },
                          })
                        }
                      >
                        {translate(`prefs.${key}`)}
                      </PanelChip>
                    ))}
                    {/* 气泡背景默认显示，所以这里的按钮语义是「取消气泡背景」，
                        与上面那排「命中即隐藏」的字段反向 */}
                    <PanelChip
                      selected={settings.appearance.hideBubbleColor}
                      onClick={() =>
                        commitSettings({
                          appearance: {
                            ...settings.appearance,
                            hideBubbleColor: !settings.appearance.hideBubbleColor,
                          },
                        })
                      }
                    >
                      {translate("liveWindow.bubbleBackground")}
                    </PanelChip>
                  </div>
                </PanelSection>

                <PanelRow label={translate("liveWindow.activity")}>
                  <PanelSegmented
                    ariaLabel={translate("liveWindow.activityMode")}
                    items={ACTIVITY_BAR_MODES.map((value) => ({
                      value,
                      label: translate(`prefs.${value}`),
                    }))}
                    value={settings.appearance.activityBarMode}
                    onChange={(value) =>
                      commitSettings({
                        appearance: {
                          ...settings.appearance,
                          activityBarMode: value as typeof settings.appearance.activityBarMode,
                        },
                      })
                    }
                  />
                </PanelRow>
                {settings.appearance.activityBarMode === "scroll" && (
                  <PanelRow label={translate("liveWindow.activityFilter")}>
                    <PanelSegmented
                      ariaLabel={translate("liveWindow.activityFilter")}
                      items={ACTIVITY_FILTERS.map((value) => ({
                        value,
                        label: translate(`prefs.${value}`),
                      }))}
                      value={settings.appearance.activityFilter}
                      onChange={(value) =>
                        commitSettings({
                          appearance: {
                            ...settings.appearance,
                            activityFilter: value as typeof settings.appearance.activityFilter,
                          },
                        })
                      }
                    />
                  </PanelRow>
                )}

                <PanelRow label={translate("liveWindow.compactSuperChatRow")}>
                  <PanelSegmented
                    ariaLabel={translate("liveWindow.compactSuperChat")}
                    items={[
                      { value: "hide" as const, label: translate("liveWindow.hidden") },
                      { value: "show" as const, label: translate("liveWindow.show") },
                    ]}
                    value={settings.appearance.scInDanmaku ? "show" : "hide"}
                    onChange={(value) =>
                      commitSettings({
                        appearance: { ...settings.appearance, scInDanmaku: value === "show" },
                      })
                    }
                  />
                </PanelRow>

                <PanelRow label={translate("liveWindow.priceColor")}>
                  <PanelSegmented
                    ariaLabel={translate("liveWindow.priceColor")}
                    items={[
                      { value: "color" as const, label: translate("liveWindow.colored") },
                      { value: "plain" as const, label: translate("liveWindow.plain") },
                    ]}
                    value={(settings.appearance.plainPriceMessages ?? false) ? "plain" : "color"}
                    onChange={(value) =>
                      commitSettings({
                        appearance: {
                          ...settings.appearance,
                          plainPriceMessages: value === "plain",
                        },
                      })
                    }
                  />
                </PanelRow>
              </div>
            </DanmakuWindowAppearanceSettings>
          </FloatingPanel>
        )}

        {filterOpen && (
          <FilterPanel onClose={() => setActivePanel(null)} />
        )}

        {emoticonPickerOpen && (
          <EmoticonPickerPanel
            roomId={roomId ?? 0}
            accountId={effectiveSendingId}
            loading={loadingEmoticons}
            error={emoticonError}
            packages={emoticonPackages}
            activePkgKey={activePkgKey}
            sending={sending}
            favoriteUniques={new Set(currentFavorites.flatMap((e) => e.emoticonUnique ? [e.emoticonUnique] : []))}
            onClose={() => setActivePanel(null)}
            onReload={() => void loadEmoticons()}
            onSelectPackage={setActivePkgKey}
            onSelectEmoticon={(emoticon) => void handleSendEmoticon(emoticon)}
            onToggleFavorite={(emoticon) => void handleToggleFavorite(emoticon)}
          />
        )}

        {giftPanelOpen && (
          <GiftPanel
            roomId={roomId ?? 0}
            ruid={anchorId}
            onSend={(giftId, giftNum, options) =>
              sendGift(roomId ?? 0, anchorId, giftId, giftNum, options)
            }
            onClose={() => setActivePanel(null)}
          />
        )}

        {autoSendOpen && (
          <AutoSendPanel
            isRunning={autoSendRunning}
            lastSentMessage={lastSentMessage}
            lastIndex={lastIndex}
            sentCount={sentCount}
            stopReason={stopReason}
            error={autoSendError}
            emoticonPackages={emoticonPackages}
            onStart={startAutoSend}
            onStop={() => void stopAutoSend()}
            like={{
              anchorId,
              isRunning: likeIsRunning,
              sentTotal: likeSentTotal,
              targetTotal: likeTargetTotal,
              error: likeError,
              stopReason: likeStopReason,
              onStart: (target, batch, interval) => startAutoLike(anchorId, target, batch, interval),
              onStop: () => void stopAutoLike(),
            }}
            onClose={() => setActivePanel(null)}
          />
        )}

        {clipboardOpen && (
          <MessageClipboardPanel
            onClose={() => setActivePanel(null)}
            onLoad={(content) => {
              setMessage(content);
              setActivePanel(null);
            }}
          />
        )}
      </div>
      )}
      </div>
      </>
      )}
    </DanmakuWindow>
    </>
  );
}
