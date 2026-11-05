import { create } from "zustand";
import type { DanmakuMessage } from "@/types/danmaku";
import type { BlockedUser } from "@/types/bilibili";

const DEFAULT_MESSAGE_LIMIT = 200;
/** 裁剪余量：超过上限后再攒满这个量才一次性裁掉，避免逐条头部删除 */
const TRIM_MARGIN = 200;
/** 入列批处理窗口：洪峰时合并提交，把每秒上百次重渲染压到 ~10 次 */
const FLUSH_INTERVAL_MS = 100;

let pendingMessages: DanmakuMessage[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 后到的译文暂存区（key = `${roomId}:${id}`）。
 *
 * 同一笔 SC 的普通/日语两种下发在 Rust 侧紧挨着发出，译文更新事件常常比
 * 正文更早到前端——此时正文还躺在 pendingMessages 批处理队列里、尚未进入
 * store，直接回填会找不到目标而丢掉译文。这里先记下来，入列时再补上。
 */
const pendingTranslations = new Map<string, string>();
const PENDING_TRANSLATION_LIMIT = 200;

function translationKey(roomId: number, id: string): string {
  return `${roomId}:${id}`;
}

function takePendingTranslation(message: DanmakuMessage): string | undefined {
  if (message.type !== "superChat") return undefined;
  const key = translationKey(message.roomId, message.id);
  const value = pendingTranslations.get(key);
  if (value !== undefined) {
    pendingTranslations.delete(key);
  }
  return value;
}

function applyMessages(state: DanmakuState, batch: DanmakuMessage[]): Partial<DanmakuState> {
  // 批内先攒新消息、每栏最后只 concat 一次：存量到十万条量级时，
  // 逐条 [...arr, msg] 整组复制会产生海量临时数组，主线程与 GC 都扛不住
  const newDanmaku: DanmakuMessage[] = [];
  const newGift: DanmakuMessage[] = [];
  const newActivity: DanmakuMessage[] = [];
  let { danmakuCount, superChatCount, guardCount } = state;
  let { droppedDanmaku, droppedGift, droppedActivity } = state;
  const cap = state.messageLimit > 0 ? state.messageLimit : Number.POSITIVE_INFINITY;

  for (const incoming of batch) {
    // 译文先于正文到达时，在这里补上（同一对象会被推进两个栏，先补再分流）
    const pendingTrans = takePendingTranslation(incoming);
    const message = pendingTrans && pendingTrans !== incoming.contentTrans
      ? { ...incoming, contentTrans: pendingTrans }
      : incoming;
    // 开播/下播是系统标记，非用户消息，不做屏蔽过滤
    const isSessionMarker = message.type === "live" || message.type === "preparing";
    if (!isSessionMarker) {
      // 屏蔽过滤：用户 UID 或关键词匹配
      if (message.uid && state.blockedUsers.some((u) => u.uid === message.uid)) {
        continue;
      }
      if (message.content && state.blockedKeywords.some((kw) => message.content.toLowerCase().includes(kw.toLowerCase()))) {
        continue;
      }
    }
    // 进场/点赞进活动栏
    if (message.type === "entry" || message.type === "like") {
      newActivity.push(message);
      continue;
    }
    const isGift = message.type === "gift" || message.type === "superChat" || message.type === "guard";
    if (isGift) {
      newGift.push(message);
      if (message.type === "superChat") superChatCount += 1;
      if (message.type === "guard") guardCount += 1;
      // 简化 SC 双重显示：礼物栏完整卡片之外，弹幕栏追加简化行
      if (message.type === "superChat" && state.scInDanmaku) {
        newDanmaku.push(message);
      }
    } else {
      newDanmaku.push(message);
      if (message.type === "danmaku") danmakuCount += 1;
    }
  }

  let danmakuMessages = newDanmaku.length > 0 ? state.danmakuMessages.concat(newDanmaku) : state.danmakuMessages;
  let giftMessages = newGift.length > 0 ? state.giftMessages.concat(newGift) : state.giftMessages;
  let activityMessages = newActivity.length > 0 ? state.activityMessages.concat(newActivity) : state.activityMessages;

  // 成批裁剪：虚拟器按 key 缓存行高，逐条头部删除会让索引整体移位、缓存与内容
  // 错位（行重叠）。攒满余量一次裁掉，由 UI 层在裁剪后重置测量。
  if (danmakuMessages.length > cap + TRIM_MARGIN) {
    const excess = danmakuMessages.length - cap;
    danmakuMessages = danmakuMessages.slice(excess);
    droppedDanmaku += excess;
  }
  if (giftMessages.length > cap + TRIM_MARGIN) {
    const excess = giftMessages.length - cap;
    giftMessages = giftMessages.slice(excess);
    droppedGift += excess;
  }
  if (activityMessages.length > cap + TRIM_MARGIN) {
    const excess = activityMessages.length - cap;
    activityMessages = activityMessages.slice(excess);
    droppedActivity += excess;
  }

  return {
    danmakuMessages,
    giftMessages,
    activityMessages,
    danmakuCount,
    superChatCount,
    guardCount,
    droppedDanmaku,
    droppedGift,
    droppedActivity,
  };
}

interface DanmakuState {
  /** 弹幕和系统消息（开启简化 SC 时也含醒目留言） */
  danmakuMessages: DanmakuMessage[];
  /** 礼物、醒目留言、上舰消息 */
  giftMessages: DanmakuMessage[];
  /** 进场、点赞等动态消息 */
  activityMessages: DanmakuMessage[];
  /** 三栏共用的消息缓存上限（0 = 无限制：整场直播的消息全部保留在内存） */
  messageLimit: number;
  wsConnected: boolean;
  wsStatus: "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "error";
  sentCount: number;
  danmakuCount: number;
  superChatCount: number;
  guardCount: number;
  /** 累计从弹幕列表头部裁掉的条数（滑窗裁剪发生时 UI 需重置虚拟器测量） */
  droppedDanmaku: number;
  /** 累计从礼物列表头部裁掉的条数 */
  droppedGift: number;
  /** 累计从活动列表头部裁掉的条数 */
  droppedActivity: number;
  isMuted: boolean;
  muteRemainSec: number;
  autoSpamRunning: boolean;
  lastError: string | null;
  roomId: number | null;
  popularity: number;
  totalLikeCount: number;
  onlineCount: number;
  /** 本场累计看过人数（WATCHED_CHANGE），0 = 尚未收到 */
  watchedCount: number;
  blockedUsers: BlockedUser[];
  blockedKeywords: string[];
  /** 是否在弹幕栏额外显示简化版醒目留言 */
  scInDanmaku: boolean;
  addMessage: (message: DanmakuMessage) => void;
  /** 醒目留言译文后到：按 id 回填 contentTrans（同一笔 SC 的 JPN 变体可能晚于原文下发） */
  updateScTranslation: (roomId: number, id: string, contentTrans: string) => void;
  setLimits: (messageLimit: number) => void;
  setScInDanmaku: (scInDanmaku: boolean) => void;
  setBlockFilter: (users: BlockedUser[], keywords: string[]) => void;
  clearMessages: () => void;
  setWsConnected: (connected: boolean) => void;
  setWsStatus: (status: DanmakuState["wsStatus"]) => void;
  incrementSentCount: () => void;
  setLastError: (message: string | null) => void;
  setRoomId: (roomId: number | null) => void;
  setPopularity: (popularity: number) => void;
  setTotalLikeCount: (count: number) => void;
  setOnlineCount: (count: number) => void;
  setWatchedCount: (count: number) => void;
}

export const useDanmakuStore = create<DanmakuState>((set) => ({
  danmakuMessages: [],
  giftMessages: [],
  activityMessages: [],
  messageLimit: DEFAULT_MESSAGE_LIMIT,
  wsConnected: false,
  wsStatus: "idle",
  sentCount: 0,
  danmakuCount: 0,
  superChatCount: 0,
  guardCount: 0,
  droppedDanmaku: 0,
  droppedGift: 0,
  droppedActivity: 0,
  isMuted: false,
  muteRemainSec: 0,
  autoSpamRunning: false,
  lastError: null,
  roomId: null,
  popularity: 0,
  totalLikeCount: 0,
  onlineCount: 0,
  watchedCount: 0,
  blockedUsers: [],
  blockedKeywords: [],
  scInDanmaku: false,
  addMessage: (message) => {
    pendingMessages.push(message);
    if (flushTimer != null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const batch = pendingMessages;
      pendingMessages = [];
      if (batch.length === 0) return;
      set((state) => applyMessages(state, batch));
    }, FLUSH_INTERVAL_MS);
  },
  setLimits: (messageLimit) => set({ messageLimit }),
  setScInDanmaku: (scInDanmaku) => set({ scInDanmaku }),
  updateScTranslation: (roomId, id, contentTrans) => {
    const state = useDanmakuStore.getState();
    const hasTarget = state.giftMessages.some((m) => m.roomId === roomId && m.id === id)
      || state.danmakuMessages.some((m) => m.roomId === roomId && m.id === id);
    if (!hasTarget) {
      // 目标还没进 store（正文仍在批处理队列里）——先存起来，入列时补
      pendingTranslations.set(translationKey(roomId, id), contentTrans);
      if (pendingTranslations.size > PENDING_TRANSLATION_LIMIT) {
        const oldest = pendingTranslations.keys().next().value;
        if (oldest !== undefined) pendingTranslations.delete(oldest);
      }
      return;
    }
    // 同一笔 SC 可能同时在礼物栏与弹幕栏（scInDanmaku），两处都要回填
    const patch = (list: DanmakuMessage[]) => {
      let changed = false;
      const next = list.map((message) => {
        if (message.roomId !== roomId || message.id !== id || message.contentTrans === contentTrans) {
          return message;
        }
        changed = true;
        return { ...message, contentTrans };
      });
      return changed ? next : list;
    };
    set({
      giftMessages: patch(state.giftMessages),
      danmakuMessages: patch(state.danmakuMessages),
    });
  },
  setBlockFilter: (blockedUsers, blockedKeywords) => set({ blockedUsers, blockedKeywords }),
  clearMessages: () => {
    // 丢弃尚未提交的批处理队列，避免切房后旧房间消息漏进新房间
    pendingMessages = [];
    pendingTranslations.clear();
    if (flushTimer != null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    set({
      danmakuMessages: [],
      giftMessages: [],
      activityMessages: [],
      totalLikeCount: 0,
      onlineCount: 0,
      watchedCount: 0,
      danmakuCount: 0,
      superChatCount: 0,
      guardCount: 0,
      droppedDanmaku: 0,
      droppedGift: 0,
      droppedActivity: 0,
    });
  },
  setWsConnected: (wsConnected) => set({ wsConnected }),
  setWsStatus: (wsStatus) => set({ wsStatus }),
  incrementSentCount: () => set((state) => ({ sentCount: state.sentCount + 1 })),
  setLastError: (lastError) => set({ lastError }),
  setRoomId: (roomId) => set({ roomId }),
  setPopularity: (popularity) => set({ popularity }),
  setTotalLikeCount: (count) => set({ totalLikeCount: count }),
  setOnlineCount: (count) => set({ onlineCount: count }),
  setWatchedCount: (count) => set({ watchedCount: count })
}));
