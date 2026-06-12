import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { useWindowPersistence } from "@/hooks/useWindowPersistence";

const appWindow = getCurrentWindow();
import { useZoom } from "@/hooks/useZoom";
import { ArrowDown, Bot, ClipboardList, Clock, Gift, Lock, LogOut, MessageSquare, MousePointerClick, Pause, Pin, PinOff, Play, Send, Settings, ShieldBan, Smile, ThumbsUp, Unlock, Users, Volume2, VolumeX, X, Zap } from "lucide-react";
import { AccountSwitcher } from "@/components/danmaku/AccountSwitcher";
import { AutoSendPanel } from "@/components/danmaku/AutoSendPanel";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { MessageClipboardPanel } from "@/components/danmaku/MessageClipboardPanel";
import { BottomActivityBar } from "@/components/danmaku/BottomActivityBar";
import { DanmakuMessageItem } from "@/components/danmaku/DanmakuMessageItem";
import { EmoticonPickerPanel } from "@/components/danmaku/EmoticonPickerPanel";
import { FloatingPanel } from "@/components/danmaku/FloatingPanel";
import { FilterPanel } from "@/components/danmaku/FilterPanel";
import { SubtitleOverlay } from "@/components/danmaku/SubtitleOverlay";
import { SuperChatCard } from "@/components/danmaku/SuperChatCard";
import { useDanmaku } from "@/hooks/useDanmaku";
import { useAutoLike } from "@/hooks/useAutoLike";
import { useAutoSend } from "@/hooks/useAutoSend";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useDanmakuStream } from "@/hooks/useDanmakuStream";
import { useDividerDrag } from "@/hooks/useDividerDrag";
import { useSttTranscript } from "@/hooks/useSttTranscript";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { tauriCommands } from "@/lib/tauri";
import { loadWindowSize } from "@/hooks/useWindowPersistence";
import { HIDE_APPEARANCE_OPTIONS } from "@/components/settings/constants";
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

  return { scrollRef, isAtBottom, checkAtBottom, scrollToBottom };
}

const PANEL = {
  AUTO_SEND: "autoSend",
  EMOTICON: "emoticon",
  FILTER: "filter",
  SETTINGS: "settings",
  CLIPBOARD: "clipboard",
} as const;

export function DanmakuPage() {
  const { roomId: roomIdParam } = useParams();
  const roomId = useMemo(() => Number(roomIdParam ?? 0) || null, [roomIdParam]);
  const [message, setMessage] = useState("");
  const inputBarRef = useRef<HTMLDivElement | null>(null);
  const composingRef = useRef(false);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const togglePanel = useCallback((name: string) => {
    setActivePanel((prev) => (prev === name ? null : name));
  }, []);
  const emoticonPickerOpen = activePanel === PANEL.EMOTICON;
  // 按账号维护的表情包缓存（key = accountId, value = 该账号的表情包列表）
  const [emoticonPkgMap, setEmoticonPkgMap] = useState<Map<string, EmoticonPackage[]>>(new Map());
  // 按账号维护的收藏表情（key = accountId）
  const [favoriteMap, setFavoriteMap] = useState<Map<string, Emoticon[]>>(new Map());
  const [loadingEmoticons, setLoadingEmoticons] = useState(false);
  const [emoticonError, setEmoticonError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiErrorKey, setAiErrorKey] = useState(0);
  const [activePkgKey, setActivePkgKey] = useState<string | null>(null);
  const autoSendOpen = activePanel === PANEL.AUTO_SEND;
  const settingsOpen = activePanel === PANEL.SETTINGS;
  const filterOpen = activePanel === PANEL.FILTER;
  const clipboardOpen = activePanel === PANEL.CLIPBOARD;
  const [volPopup, setVolPopup] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [locked, setLocked] = useState(false);
  const [passthroughEnabled, setPassthroughEnabled] = useState(false);
  const passthroughIgnoredRef = useRef(false);
  const { disconnect } = useDanmakuStream(roomId);

  const storeDanmakuMessages = useDanmakuStore((state) => state.danmakuMessages);
  const storeGiftMessages = useDanmakuStore((state) => state.giftMessages);
  const latestEntry = useDanmakuStore((state) => state.latestEntry);
  const totalLikeCount = useDanmakuStore((state) => state.totalLikeCount);
  const guardCount = useDanmakuStore((state) => state.guardCount);

  // 礼物栏筛选
  const [showGift, setShowGift] = useState(true);
  const [showSuperChat, setShowSuperChat] = useState(true);
  const [showGuard, setShowGuard] = useState(true);
  const [batteryFilter, setBatteryFilter] = useState(0);
  const [batteryInput, setBatteryInput] = useState("");
  const [showBatteryFilter, setShowBatteryFilter] = useState(false);
  const onlineCount = useDanmakuStore((state) => state.onlineCount);
  const danmakuCount = useDanmakuStore((state) => state.danmakuCount);
  const superChatCount = useDanmakuStore((state) => state.superChatCount);
  const rooms = useRoomStore((state) => state.rooms);
  const activeAccountId = useAuthStore((state) => state.activeAccountId);
  const isAnonymous = useAuthStore((state) => state.isAnonymous);
  const currentRoom = rooms.find((r) => r.roomId === roomId);

  // 匿名模式下，房间可能不在 room store 中，需要从 API 获取房间信息
  const [fetchedRoomInfo, setFetchedRoomInfo] = useState<{ uname: string; title: string } | null>(null);
  useEffect(() => {
    if (!roomId || currentRoom) {
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

  // 优先使用 room store 中的数据，否则使用从 API 获取的数据
  const displayRoomInfo = currentRoom
    ? { uname: currentRoom.uname, title: currentRoom.title }
    : fetchedRoomInfo;

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
    pkgName: "收藏",
    pkgType: -1,
    currentCover: filteredFavorites[0]?.url,
    emoticons: filteredFavorites,
  }), [filteredFavorites]);

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
    if (!roomId) return;
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
    if (totalMin < 1) return "刚刚开播";
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0) return `${h}h${m}m`;
    return `${m}m`;
  }, [liveTime, now]);

  // 切房时通知 AstrBot（用 ref 防止 StrictMode 双重调用）
  const switchedRoomRef = useRef<number | null>(null);
  useEffect(() => {
    if (!roomId || switchedRoomRef.current === roomId) return;
    switchedRoomRef.current = roomId;
    const room = rooms.find((r) => r.roomId === roomId);
    tauriCommands.ai.getCallbackPort().then((port) => {
      const callbackUrl = port > 0 ? `http://127.0.0.1:${port}/astrbot/callback` : undefined;
      return tauriCommands.ai.switchRoom(roomId, callbackUrl, room?.uname, room?.title);
    }).catch(() => {
      // AstrBot 未配置时静默忽略
    });
  }, [roomId, rooms]);

  const { send, sendEmoticon, sending } = useDanmaku();
  const audioSettings = useSettingsStore((s) => s.settings.audio);
  const sttSettings = useSettingsStore((s) => s.settings.stt);
  const fontSize = useSettingsStore((s) => s.settings.appearance.fontSize);
  const opacity = useSettingsStore((s) => s.settings.appearance.opacity);
  const sttAvailable = useSettingsStore((s) => s.sttAvailable);
  const aiAvailable = useSettingsStore((s) => s.aiAvailable);
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
    volume: audioVolume,
    error: audioError,
    play: audioPlay,
    stop: audioStop,
    setVolume: audioSetVolume,
  } = useAudioPlayer(roomId, audioSettings.defaultVolume / 100);
  const { currentText: sttText, isSpeaking: sttSpeaking } = useSttTranscript(sttAvailable ? sttSettings.syncDelayMs : 0);

  // 自动播放音频
  useEffect(() => {
    if (roomId && audioSettings.autoPlay) {
      void audioPlay();
    }
  }, [roomId, audioSettings.autoPlay]);


  const handleAudioPlay = useCallback(async () => {
    await audioPlay();
    if (sttAvailable && sttSettings.enabled) {
      try { await tauriCommands.stt.start(); } catch { /* STT may not have models */ }
    }
  }, [audioPlay, sttAvailable, sttSettings.enabled]);

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

  // 窗口尺寸变化时保存到 localStorage
  useWindowPersistence("danmaku-window");
  useZoom();

  // 弹幕窗口启用透明背景
  useEffect(() => {
    document.documentElement.dataset.transparent = "true";
    return () => {
      delete document.documentElement.dataset.transparent;
    };
  }, []);

  // 关闭窗口时隐藏到托盘（不断开连接）
  useEffect(() => {
    const unlisten = appWindow.onCloseRequested((e) => {
      e.preventDefault();
      void appWindow.hide();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [disconnect, sttAvailable]);

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

  // ── 消息分流 ──
  const giftMessages = useMemo(() => storeGiftMessages.filter((m) => {
    const isGiftType = (m.type === "gift" && showGift) ||
      (m.type === "superChat" && showSuperChat) ||
      (m.type === "guard" && showGuard);
    if (!isGiftType) return false;
    if (batteryFilter > 0) {
      // 电池筛选: 10电池=1元, price单位是金瓜子(1元=1000金瓜子)
      const msgBatteries = ((m.price ?? 0) / 1000) * 10;
      return msgBatteries >= batteryFilter;
    }
    return true;
  }), [storeGiftMessages, showGift, showSuperChat, showGuard, batteryFilter]);
  const danmakuMessages = storeDanmakuMessages;
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

  // ── 各栏自动滚动 ──
  const giftScroll = useAutoScroll(giftMessages);
  const danmakuScroll = useAutoScroll(danmakuMessages);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (inputBarRef.current?.contains(target)) return;
      setActivePanel(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  // ── 窗口透传：单窗口动态命中测试 ──
  useEffect(() => {
    let checking = false;

    const setIgnored = (ignored: boolean) => {
      if (passthroughIgnoredRef.current === ignored) return;
      const previous = passthroughIgnoredRef.current;
      passthroughIgnoredRef.current = ignored;
      void appWindow.setIgnoreCursorEvents(ignored).catch(() => {
        if (passthroughIgnoredRef.current === ignored) {
          passthroughIgnoredRef.current = previous;
        }
      });
    };

    if (!passthroughEnabled) {
      setIgnored(false);
      return;
    };

    const shouldPassThrough = (x: number, y: number) => {
      // elementFromPoint is a DOM hit-test and should remain valid while the OS
      // ignores cursor events for this window; the polling loop depends on that.
      const element = document.elementFromPoint(x, y);
      if (!element) return true;
      return !element.closest("[data-interactive]");
    };

    const checkCursorPosition = () => {
      if (checking) return;
      checking = true;
      void (async () => {
        // 弹幕窗口创建时 decorations=false，因此 inner 坐标就是 WebView client area。
        const [cursor, windowPosition, windowSize, scaleFactor] = await Promise.all([
          cursorPosition(),
          appWindow.innerPosition(),
          appWindow.innerSize(),
          appWindow.scaleFactor(),
        ]);

        const insideWindow =
          cursor.x >= windowPosition.x &&
          cursor.y >= windowPosition.y &&
          cursor.x < windowPosition.x + windowSize.width &&
          cursor.y < windowPosition.y + windowSize.height;

        if (!insideWindow) {
          setIgnored(false);
          return;
        }

        const clientX = (cursor.x - windowPosition.x) / scaleFactor;
        const clientY = (cursor.y - windowPosition.y) / scaleFactor;
        setIgnored(shouldPassThrough(clientX, clientY));
      })().finally(() => {
        checking = false;
      });
    };

    const poll = window.setInterval(checkCursorPosition, 50);
    checkCursorPosition();

    return () => {
      window.clearInterval(poll);
      setIgnored(false);
    };
  }, [passthroughEnabled]);

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
      setEmoticonError(error instanceof Error ? error.message : "加载表情失败");
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

  const handleSend = async () => {
    if (!roomId || !message.trim()) return;
    const text = message.trim().slice(0, 40);
    try {
      await send(roomId, text);
      setMessage("");
      setSendError(null);
    } catch (error) {
      // 从 danmaku store 获取错误消息（useDanmaku 已经设置了）
      const storeError = useDanmakuStore.getState().lastError;
      setSendError(storeError ?? "发送弹幕失败");
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

  const handleTitleBarMouseDown = useCallback((e: React.MouseEvent) => {
    if (locked) return;
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.button === 0) void appWindow.startDragging();
  }, [locked]);

  return (
    <main className="danmaku-bg-main window-rounded flex h-full flex-col overflow-hidden select-none text-slate-900 dark:text-slate-100" style={{ "--bg-a": bgAlpha } as React.CSSProperties}>
      {/* 标题栏 */}
      <div
        data-interactive=""
        className="danmaku-bg-bar flex select-none items-center pl-3"
        onMouseDown={handleTitleBarMouseDown}
      >
        <span className="flex-1 truncate text-sm text-slate-500 dark:text-slate-400">
          {displayRoomInfo ? `${displayRoomInfo.uname} - ${displayRoomInfo.title}` : `房间 ${roomId ?? ""}`}
        </span>
        <button
          type="button"
          onClick={() => {
            const next = !pinned;
            setPinned(next);
            void appWindow.setAlwaysOnTop(next);
          }}
          className="flex h-6 w-6 items-center justify-center text-slate-400 transition hover:bg-[#ebebeb] dark:text-slate-500 dark:hover:bg-white/[0.06]"
          title={pinned ? "取消置顶" : "置顶"}
        >
          {pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => setLocked((v) => !v)}
          className="flex h-6 w-6 items-center justify-center text-slate-400 transition hover:bg-[#ebebeb] dark:text-slate-500 dark:hover:bg-white/[0.06]"
          title={locked ? "解锁位置" : "锁定位置"}
        >
          {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => setPassthroughEnabled((v) => !v)}
          className={`flex h-6 w-6 items-center justify-center transition ${
            passthroughEnabled
              ? "text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-500/10"
              : "text-slate-400 hover:bg-[#ebebeb] dark:text-slate-500 dark:hover:bg-white/[0.06]"
          }`}
          title={passthroughEnabled ? "关闭窗口透传" : "开启窗口透传"}
        >
          <MousePointerClick className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => appWindow.close()}
          className="flex h-6 w-6 items-center justify-center text-slate-400 transition hover:bg-[#ebebeb] dark:text-slate-500 dark:hover:bg-white/[0.06]"
          title="隐藏到托盘"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={async () => {
            // 断开连接，最多等 1 秒
            const timeout = new Promise((r) => setTimeout(r, 1000));
            await Promise.race([
              tauriCommands.ws.disconnect().catch(() => {}),
              timeout,
            ]);
            if (sttAvailable) {
              tauriCommands.stt.stop().catch(() => {});
            }
            tauriCommands.ai.disconnect().catch(() => {});
            void appWindow.destroy();
          }}
          className="flex h-6 w-6 items-center justify-center text-slate-400 transition hover:bg-rose-500 hover:text-white dark:text-slate-500 dark:hover:bg-rose-500"
          title="退出直播间"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 控制栏 */}
      <div data-interactive="" className="danmaku-bg-panel flex items-center gap-2 px-3 py-1">
        <button
          type="button"
          onClick={() => void (audioPlaying ? handleAudioStop() : handleAudioPlay())}
          disabled={!roomId || audioConnecting}
          className={`flex h-6 w-6 items-center justify-center transition ${
            audioPlaying
              ? "text-pink-500 hover:text-pink-400"
              : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          } disabled:cursor-not-allowed disabled:opacity-50`}
          title={audioPlaying ? "停止音频" : "播放音频"}
        >
          {audioConnecting ? (
            <span className="block h-3 w-3 animate-spin rounded-full border-2 border-pink-500 border-t-transparent" />
          ) : audioPlaying ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </button>

        <div
          className="relative flex items-center"
          onMouseEnter={() => setVolPopup(true)}
          onMouseLeave={() => setVolPopup(false)}
        >
          <button
            type="button"
            onClick={() => audioSetVolume(audioVolume === 0 ? 0.8 : 0)}
            className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          >
            {audioVolume === 0 ? (
              <VolumeX className="h-3.5 w-3.5" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
          </button>
          {volPopup && (
            <div className="danmaku-bg-panel absolute top-full left-1/2 z-30 -translate-x-1/2 rounded px-2 py-2" style={{ marginTop: "-2px" }}>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(audioVolume * 100)}
                onChange={(e) => audioSetVolume(Number(e.target.value) / 100)}
                className="h-20 w-1 cursor-pointer accent-pink-500"
                style={{ writingMode: "vertical-lr", direction: "rtl" }}
              />
            </div>
          )}
        </div>

        <span className="ml-auto flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
          {danmakuCount > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {danmakuCount}
            </span>
          )}
          {giftTotal > 0 && (
            <span className="flex items-center gap-1">
              <Gift className="h-3 w-3" />
              ¥{giftTotal.toFixed(2)}
              {superChatCount > 0 && (
                <span className="text-slate-300 dark:text-slate-600">({superChatCount}SC)</span>
              )}
              {guardCount > 0 && (
                <span className="text-slate-300 dark:text-slate-600">({guardCount}舰)</span>
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
              {onlineCount >= 10000
                ? `${(onlineCount / 10000).toFixed(1)}万`
                : onlineCount >= 1000
                  ? `${(onlineCount / 1000).toFixed(1)}k`
                  : String(onlineCount)}
            </span>
          )}
          {totalLikeCount > 0 && (
            <span className="flex items-center gap-1">
              <ThumbsUp className="h-3 w-3" />
              {totalLikeCount >= 10000
                ? `${(totalLikeCount / 10000).toFixed(1)}万`
                : totalLikeCount >= 1000
                  ? `${(totalLikeCount / 1000).toFixed(1)}k`
                  : String(totalLikeCount)}
            </span>
          )}
        </span>
      </div>

      {/* 隐藏音频元素 */}
      <audio ref={audioRef} className="hidden" />

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
                    <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">电池≥</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={batteryInput}
                      onChange={(e) => setBatteryInput(e.target.value.replace(/\D/g, ""))}
                      placeholder="0"
                      className="h-5 min-w-0 flex-1 appearance-none rounded border border-neutral-200 bg-[#f8f8f8] px-1.5 text-xs text-slate-600 outline-none focus:ring-2 focus:ring-pink-500/30 dark:border-neutral-700 dark:bg-[#1a1c24] dark:text-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = Math.max(0, Math.floor(Number(batteryInput) || 0));
                        setBatteryFilter(val);
                        setShowBatteryFilter(false);
                      }}
                      className="shrink-0 rounded px-1.5 py-0.5 text-xs text-pink-500 transition hover:bg-pink-50 dark:hover:bg-pink-500/10"
                    >
                      确定
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBatteryFilter(0);
                        setBatteryInput("");
                        setShowBatteryFilter(false);
                      }}
                      className="shrink-0 rounded px-1.5 py-0.5 text-xs text-slate-400 transition hover:bg-[#ebebeb] dark:hover:bg-white/[0.04]"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowGift((v) => !v)}
                      className={`rounded px-1.5 py-0.5 text-xs transition ${showGift ? "bg-pink-500/10 text-pink-500" : "text-slate-400 dark:text-slate-500"} hover:bg-[#ebebeb] dark:hover:bg-white/[0.04]`}
                    >
                      送礼
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGuard((v) => !v)}
                      className={`rounded px-1.5 py-0.5 text-xs transition ${showGuard ? "bg-pink-500/10 text-pink-500" : "text-slate-400 dark:text-slate-500"} hover:bg-[#ebebeb] dark:hover:bg-white/[0.04]`}
                    >
                      上舰
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSuperChat((v) => !v)}
                      className={`rounded px-1.5 py-0.5 text-xs transition ${showSuperChat ? "bg-pink-500/10 text-pink-500" : "text-slate-400 dark:text-slate-500"} hover:bg-[#ebebeb] dark:hover:bg-white/[0.04]`}
                    >
                      醒目留言
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBatteryFilter(true)}
                      className={`ml-auto inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs transition ${batteryFilter > 0 ? "bg-pink-500/10 text-pink-500" : "text-slate-400 dark:text-slate-500"} hover:bg-[#ebebeb] dark:hover:bg-white/[0.04]`}
                      title="按电池筛选"
                    >
                      电池筛选
                    </button>
                  </>
                )}
              </div>
              <div
                ref={giftScroll.scrollRef}
                onScroll={giftScroll.checkAtBottom}
                onMouseDown={(e) => {
                  if (!locked && !passthroughEnabled && e.target === e.currentTarget && e.button === 0) {
                    void appWindow.startDragging();
                  }
                }}
                className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pt-2.5 pr-2.5 pb-1 pl-1"
                style={{ fontSize: `${fontSize}px` }}
              >
                {giftMessages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400 dark:text-slate-500 select-none pointer-events-none">
                    送礼、醒目留言、上舰消息等显示在这里
                  </div>
                ) : (
                  giftMessages.map((item) =>
                    item.type === "superChat" ? (
                      <SuperChatCard key={`${item.roomId}-${item.id}-${item.timestamp}`} item={item} />
                    ) : (
                      <DanmakuMessageItem key={`${item.roomId}-${item.id}-${item.timestamp}`} item={item} />
                    )
                  )
                )}
              </div>
              {!giftScroll.isAtBottom && (
                <button
                  data-interactive=""
                  onClick={giftScroll.scrollToBottom}
                  className="absolute left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 bg-pink-500 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-pink-400"
                  style={{ bottom: "4px" }}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                  回到底部
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
          className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-500"
        >
          <div className="h-px w-full bg-slate-300/60 transition-all group-hover:h-0.5 group-hover:bg-pink-400/60 dark:bg-white/[0.08] dark:group-hover:bg-pink-400/40" />
        </div>

        {/* 弹幕栏 — 始终渲染，flex=1-ratio 控制大小 */}
        <div className="relative min-h-0 overflow-hidden" style={{ flex: 1 - ratio }}>
          {showDanmaku && (
            <>
              <div
                ref={danmakuScroll.scrollRef}
                onScroll={danmakuScroll.checkAtBottom}
                onMouseDown={(e) => {
                  if (!locked && !passthroughEnabled && e.target === e.currentTarget && e.button === 0) {
                    void appWindow.startDragging();
                  }
                }}
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
                  <div className="flex h-full items-center justify-center text-xs text-slate-400 dark:text-slate-500 select-none pointer-events-none">
                    展示本场直播的弹幕互动消息
                  </div>
                ) : (
                  danmakuMessages.map((item) => (
                    <DanmakuMessageItem key={`${item.roomId}-${item.id}-${item.timestamp}`} item={item} fontSize={fontSize} cachedEmotUrls={cachedEmotUrls} onMention={handleMention} />
                  ))
                )}
              </div>
              {!danmakuScroll.isAtBottom && (
                <button
                  data-interactive=""
                  onClick={danmakuScroll.scrollToBottom}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 bg-pink-500 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-pink-400"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                  回到底部
                </button>
              )}
            </>
          )}
        </div>

        {sttAvailable && <SubtitleOverlay text={sttText} isSpeaking={sttSpeaking} />}
      </div>

      {/* 活动信息：入场 */}
      {latestEntry && (
        <div data-interactive="" className="danmaku-bg-panel shrink-0">
          <BottomActivityBar
            icon={<span className="text-xs">↪</span>}
            username={latestEntry.username}
            content={latestEntry.content}
            tone="entry"
          />
        </div>
      )}

      {/* 浮动面板（覆盖在内容区上方） */}
      <div className="absolute inset-x-0 bottom-0 z-20">
        {settingsOpen && (
          <FloatingPanel title="外观设置" onClose={() => setActivePanel(null)}>
            <div className="space-y-3">
              <OpacitySlider
                labelClassName="text-xs text-slate-500 dark:text-slate-400"
                valueClassName="text-xs text-slate-500 dark:text-slate-400"
                className=""
                value={opacity}
                onChange={(val) => commitSettings({ appearance: { opacity: val } } as Partial<SettingsType>)}
              />
              {HIDE_APPEARANCE_OPTIONS.map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={settings.appearance[key]}
                    onChange={(e) =>
                      commitSettings({
                        appearance: { ...settings.appearance, [key]: e.target.checked }
                      })
                    }
                  />
                </label>
              ))}
            </div>
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
      </div>

      {/* 发送栏 */}
      <div data-interactive="" className="danmaku-bg-panel relative px-3 py-2">
        {aiError && (
          <InlineMessage key={aiErrorKey} type="error" className="mb-2">{aiError}</InlineMessage>
        )}
        {sendError && (
          <InlineMessage key={sendErrorKey} type="error" className="mb-2">{sendError}</InlineMessage>
        )}

        {/* 功能按钮行 */}
        <div ref={inputBarRef} className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => { if (!isAnonymous) togglePanel(PANEL.AUTO_SEND); }}
            disabled={isAnonymous}
            title={isAnonymous ? "匿名模式下不可用" : "自动发送"}
            className={`rounded inline-flex items-center p-1.5 text-xs transition ${
              isAnonymous ? "cursor-not-allowed opacity-40"
                : autoSendRunning ? "danmaku-btn-active text-emerald-600 dark:text-emerald-300"
                : activePanel === PANEL.AUTO_SEND ? "bg-pink-500/15 text-pink-500"
                : "danmaku-bg-bar text-slate-500 hover:bg-[#ebebeb] dark:text-slate-300 dark:hover:bg-white/[0.04]"
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => { if (!isAnonymous) void handleToggleEmoticonPicker(); }}
            disabled={isAnonymous}
            title={isAnonymous ? "匿名模式下不可用" : "表情"}
            className={`rounded inline-flex items-center p-1.5 text-xs transition ${
              isAnonymous ? "cursor-not-allowed opacity-40"
                : activePanel === PANEL.EMOTICON ? "bg-pink-500/15 text-pink-500"
                : "danmaku-bg-bar text-slate-500 hover:bg-[#ebebeb] dark:text-slate-300 dark:hover:bg-white/[0.04]"
            }`}
          >
            <Smile className="h-3.5 w-3.5" />
          </button>
          <AccountSwitcher viewingAccountId={activeAccountId} />
          <button
            type="button"
            onClick={() => togglePanel(PANEL.FILTER)}
            title="屏蔽管理"
            className={`danmaku-bg-bar rounded inline-flex items-center p-1.5 text-xs transition ${
              activePanel === PANEL.FILTER ? "bg-pink-500/15 text-pink-500"
                : "text-slate-500 hover:bg-[#ebebeb] dark:text-slate-300 dark:hover:bg-white/[0.04]"
            }`}
          >
            <ShieldBan className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => togglePanel(PANEL.SETTINGS)}
            title="设置"
            className={`danmaku-bg-bar rounded inline-flex items-center p-1.5 text-xs transition ${
              activePanel === PANEL.SETTINGS ? "bg-pink-500/15 text-pink-500"
                : "text-slate-500 hover:bg-[#ebebeb] dark:text-slate-300 dark:hover:bg-white/[0.04]"
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => togglePanel(PANEL.CLIPBOARD)}
            title="快捷消息"
            className={`danmaku-bg-bar rounded inline-flex items-center p-1.5 text-xs transition ${
              activePanel === PANEL.CLIPBOARD ? "bg-pink-500/15 text-pink-500"
                : "text-slate-500 hover:bg-[#ebebeb] dark:text-slate-300 dark:hover:bg-white/[0.04]"
            }`}
          >
            <ClipboardList className="h-3.5 w-3.5" />
          </button>
          {aiAvailable && (
            <button
              type="button"
              onClick={() => {
                tauriCommands.ai.getStatus().then(() => {
                  if (roomId) void tauriCommands.room.openDrawer(roomId, "ai");
                }).catch(() => {
                  setAiError("未连接 AstrBot，请先配置 AI 代理");
                  setAiErrorKey((k) => k + 1);
                });
              }}
              title="AI 助手"
              className="danmaku-bg-bar rounded inline-flex items-center p-1.5 text-xs text-slate-500 transition hover:bg-violet-100 hover:text-violet-600 dark:text-slate-300 dark:hover:bg-violet-500/20 dark:hover:text-violet-400"
            >
              <Bot className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* 弹幕输入行 */}
        <div className="danmaku-bg-bar rounded flex items-center pr-1">
          <textarea
            value={message}
              disabled={isAnonymous}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={(event) => {
                composingRef.current = false;
                const text = event.currentTarget.value.slice(0, 40);
                setMessage(text);
                event.currentTarget.style.height = "auto";
                event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 120)}px`;
              }}
              onChange={(event) => {
                if (isAnonymous) return;
                const val = event.target.value;
                // 拼音输入中允许超出，结束后截断
                if (composingRef.current) {
                  setMessage(val);
                } else {
                  setMessage(val.slice(0, 40));
                }
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={isAnonymous ? "匿名模式下无法发送弹幕" : "请输入文字"}
              rows={1}
              className={`min-h-[40px] flex-1 resize-none bg-transparent py-2.5 pl-3 pr-0 text-sm outline-none ${
                isAnonymous
                  ? "cursor-not-allowed text-slate-400 placeholder:text-slate-400 dark:text-slate-600 dark:placeholder:text-slate-600"
                  : "text-slate-900 placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500"
              }`}
              style={{ maxHeight: "120px" }}
            />
            <button
              onClick={() => void handleSend()}
              disabled={!roomId || !message.trim() || sending || isAnonymous}
              className={`m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded transition ${
                isAnonymous
                  ? "cursor-not-allowed text-slate-400 opacity-40"
                  : "text-pink-500 hover:bg-pink-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-pink-500/10"
              }`}
              title={isAnonymous ? "匿名模式下不可用" : sending ? "发送中" : "发送"}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
    </main>
  );
}
