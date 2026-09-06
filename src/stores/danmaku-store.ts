import { create } from "zustand";
import type { DanmakuMessage } from "@/types/danmaku";
import type { BlockedUser } from "@/types/bilibili";

const DEFAULT_DANMAKU_LIMIT = 200;
const DEFAULT_GIFT_LIMIT = 100;
/** 0=无限制时的内置安全上限：防止无界增长把主线程拖垮（每条消息都要复制数组） */
const HARD_MAX_MESSAGES = 3000;
/** 裁剪余量：超过上限后再攒满这个量才一次性裁掉，避免逐条头部删除 */
const TRIM_MARGIN = 200;
/** 入列批处理窗口：洪峰时合并提交，把每秒上百次重渲染压到 ~10 次 */
const FLUSH_INTERVAL_MS = 100;

let pendingMessages: DanmakuMessage[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function applyMessages(state: DanmakuState, batch: DanmakuMessage[]): Partial<DanmakuState> {
  let danmakuMessages = state.danmakuMessages;
  let giftMessages = state.giftMessages;
  let { danmakuCount, superChatCount, guardCount } = state;
  let { droppedDanmaku, droppedGift } = state;
  const danmakuCap = state.danmakuLimit > 0 ? state.danmakuLimit : HARD_MAX_MESSAGES;
  const giftCap = state.giftLimit > 0 ? state.giftLimit : HARD_MAX_MESSAGES;

  for (const message of batch) {
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
    const isGift = message.type === "gift" || message.type === "superChat" || message.type === "guard";
    if (isGift) {
      giftMessages = [...giftMessages, message];
      if (message.type === "superChat") superChatCount += 1;
      if (message.type === "guard") guardCount += 1;
    } else {
      danmakuMessages = [...danmakuMessages, message];
      if (message.type === "danmaku") danmakuCount += 1;
    }
  }

  // 成批裁剪：虚拟器的测量缓存按索引记录，逐条头部删除会让索引整体移位、
  // 缓存与内容错位（行重叠）。攒满余量一次裁掉，由 UI 层在裁剪后重置测量。
  if (danmakuMessages.length > danmakuCap + TRIM_MARGIN) {
    const excess = danmakuMessages.length - danmakuCap;
    danmakuMessages = danmakuMessages.slice(excess);
    droppedDanmaku += excess;
  }
  if (giftMessages.length > giftCap + TRIM_MARGIN) {
    const excess = giftMessages.length - giftCap;
    giftMessages = giftMessages.slice(excess);
    droppedGift += excess;
  }

  return {
    danmakuMessages,
    giftMessages,
    danmakuCount,
    superChatCount,
    guardCount,
    droppedDanmaku,
    droppedGift,
  };
}

interface DanmakuState {
  /** 弹幕和系统消息 */
  danmakuMessages: DanmakuMessage[];
  /** 礼物、醒目留言、上舰消息 */
  giftMessages: DanmakuMessage[];
  /** 弹幕消息缓存上限 */
  danmakuLimit: number;
  /** 礼物消息缓存上限 */
  giftLimit: number;
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
  isMuted: boolean;
  muteRemainSec: number;
  autoSpamRunning: boolean;
  lastError: string | null;
  roomId: number | null;
  popularity: number;
  totalLikeCount: number;
  onlineCount: number;
  blockedUsers: BlockedUser[];
  blockedKeywords: string[];
  hideEntryMessage: boolean;
  hideLikeMessage: boolean;
  addMessage: (message: DanmakuMessage) => void;
  setLimits: (danmaku: number, gift: number) => void;
  setBlockFilter: (users: BlockedUser[], keywords: string[]) => void;
  setHideEntryMessage: (hide: boolean) => void;
  setHideLikeMessage: (hide: boolean) => void;
  clearMessages: () => void;
  setWsConnected: (connected: boolean) => void;
  setWsStatus: (status: DanmakuState["wsStatus"]) => void;
  incrementSentCount: () => void;
  setLastError: (message: string | null) => void;
  setRoomId: (roomId: number | null) => void;
  setPopularity: (popularity: number) => void;
  setTotalLikeCount: (count: number) => void;
  setOnlineCount: (count: number) => void;
}

export const useDanmakuStore = create<DanmakuState>((set) => ({
  danmakuMessages: [],
  giftMessages: [],
  danmakuLimit: DEFAULT_DANMAKU_LIMIT,
  giftLimit: DEFAULT_GIFT_LIMIT,
  wsConnected: false,
  wsStatus: "idle",
  sentCount: 0,
  danmakuCount: 0,
  superChatCount: 0,
  guardCount: 0,
  droppedDanmaku: 0,
  droppedGift: 0,
  isMuted: false,
  muteRemainSec: 0,
  autoSpamRunning: false,
  lastError: null,
  roomId: null,
  popularity: 0,
  totalLikeCount: 0,
  onlineCount: 0,
  blockedUsers: [],
  blockedKeywords: [],
  hideEntryMessage: false,
  hideLikeMessage: false,
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
  setLimits: (danmaku, gift) => set({ danmakuLimit: danmaku, giftLimit: gift }),
  setBlockFilter: (blockedUsers, blockedKeywords) => set({ blockedUsers, blockedKeywords }),
  setHideEntryMessage: (hideEntryMessage) => set({ hideEntryMessage }),
  setHideLikeMessage: (hideLikeMessage) => set({ hideLikeMessage }),
  clearMessages: () => {
    // 丢弃尚未提交的批处理队列，避免切房后旧房间消息漏进新房间
    pendingMessages = [];
    if (flushTimer != null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    set({ danmakuMessages: [], giftMessages: [], totalLikeCount: 0, onlineCount: 0, danmakuCount: 0, superChatCount: 0, guardCount: 0, droppedDanmaku: 0, droppedGift: 0 });
  },
  setWsConnected: (wsConnected) => set({ wsConnected }),
  setWsStatus: (wsStatus) => set({ wsStatus }),
  incrementSentCount: () => set((state) => ({ sentCount: state.sentCount + 1 })),
  setLastError: (lastError) => set({ lastError }),
  setRoomId: (roomId) => set({ roomId }),
  setPopularity: (popularity) => set({ popularity }),
  setTotalLikeCount: (count) => set({ totalLikeCount: count }),
  setOnlineCount: (count) => set({ onlineCount: count })
}));
