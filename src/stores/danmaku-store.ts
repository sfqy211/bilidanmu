import { create } from "zustand";
import type { DanmakuMessage } from "@/types/danmaku";
import type { BlockedUser } from "@/types/bilibili";

const DEFAULT_DANMAKU_LIMIT = 200;
const DEFAULT_GIFT_LIMIT = 100;

interface DanmakuState {
  /** 弹幕和系统消息 */
  danmakuMessages: DanmakuMessage[];
  /** 礼物、醒目留言、上舰消息 */
  giftMessages: DanmakuMessage[];
  /** 弹幕消息缓存上限 */
  danmakuLimit: number;
  /** 礼物消息缓存上限 */
  giftLimit: number;
  latestLike: DanmakuMessage | null;
  latestEntry: DanmakuMessage | null;
  wsConnected: boolean;
  wsStatus: "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "error";
  sentCount: number;
  danmakuCount: number;
  superChatCount: number;
  guardCount: number;
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
  addMessage: (message: DanmakuMessage) => void;
  setLimits: (danmaku: number, gift: number) => void;
  setBlockFilter: (users: BlockedUser[], keywords: string[]) => void;
  setLatestLike: (message: DanmakuMessage | null) => void;
  setLatestEntry: (message: DanmakuMessage | null) => void;
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
  latestLike: null,
  latestEntry: null,
  wsConnected: false,
  wsStatus: "idle",
  sentCount: 0,
  danmakuCount: 0,
  superChatCount: 0,
  guardCount: 0,
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
  addMessage: (message) =>
    set((state) => {
      // 屏蔽过滤：用户 UID 或关键词匹配
      if (message.uid && state.blockedUsers.some((u) => u.uid === message.uid)) {
        return {};
      }
      if (message.content && state.blockedKeywords.some((kw) => message.content.toLowerCase().includes(kw.toLowerCase()))) {
        return {};
      }

      const isGift = message.type === "gift" || message.type === "superChat" || message.type === "guard";
      if (isGift) {
        const limit = state.giftLimit > 0 ? state.giftLimit : Number.MAX_SAFE_INTEGER;
        return {
          giftMessages: [...state.giftMessages.slice(-(limit - 1)), message],
          danmakuCount: state.danmakuCount,
          superChatCount: message.type === "superChat" ? state.superChatCount + 1 : state.superChatCount,
          guardCount: message.type === "guard" ? state.guardCount + 1 : state.guardCount,
        };
      }
      const limit = state.danmakuLimit > 0 ? state.danmakuLimit : Number.MAX_SAFE_INTEGER;
      return {
        danmakuMessages: [...state.danmakuMessages.slice(-(limit - 1)), message],
        danmakuCount: message.type === "danmaku" ? state.danmakuCount + 1 : state.danmakuCount,
        superChatCount: state.superChatCount,
        guardCount: state.guardCount,
      };
    }),
  setLimits: (danmaku, gift) => set({ danmakuLimit: danmaku, giftLimit: gift }),
  setBlockFilter: (blockedUsers, blockedKeywords) => set({ blockedUsers, blockedKeywords }),
  setLatestLike: (latestLike) => set({ latestLike }),
  setLatestEntry: (latestEntry) => set({ latestEntry }),
  clearMessages: () => set({ danmakuMessages: [], giftMessages: [], latestLike: null, latestEntry: null, totalLikeCount: 0, onlineCount: 0, danmakuCount: 0, superChatCount: 0, guardCount: 0 }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
  setWsStatus: (wsStatus) => set({ wsStatus }),
  incrementSentCount: () => set((state) => ({ sentCount: state.sentCount + 1 })),
  setLastError: (lastError) => set({ lastError }),
  setRoomId: (roomId) => set({ roomId }),
  setPopularity: (popularity) => set({ popularity }),
  setTotalLikeCount: (count) => set({ totalLikeCount: count }),
  setOnlineCount: (count) => set({ onlineCount: count })
}));
