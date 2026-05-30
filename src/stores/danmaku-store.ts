import { create } from "zustand";
import type { DanmakuMessage } from "@/types/danmaku";

interface DanmakuState {
  messages: DanmakuMessage[];
  latestLike: DanmakuMessage | null;
  latestEntry: DanmakuMessage | null;
  wsConnected: boolean;
  wsStatus: "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "error";
  sentCount: number;
  isMuted: boolean;
  muteRemainSec: number;
  autoSpamRunning: boolean;
  lastError: string | null;
  roomId: number | null;
  popularity: number;
  totalLikeCount: number;
  onlineCount: number;
  addMessage: (message: DanmakuMessage) => void;
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
  messages: [],
  latestLike: null,
  latestEntry: null,
  wsConnected: false,
  wsStatus: "idle",
  sentCount: 0,
  isMuted: false,
  muteRemainSec: 0,
  autoSpamRunning: false,
  lastError: null,
  roomId: null,
  popularity: 0,
  totalLikeCount: 0,
  onlineCount: 0,
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages.slice(-199), message] })),
  setLatestLike: (latestLike) => set({ latestLike }),
  setLatestEntry: (latestEntry) => set({ latestEntry }),
  clearMessages: () => set({ messages: [], latestLike: null, latestEntry: null, totalLikeCount: 0, onlineCount: 0 }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
  setWsStatus: (wsStatus) => set({ wsStatus }),
  incrementSentCount: () => set((state) => ({ sentCount: state.sentCount + 1 })),
  setLastError: (lastError) => set({ lastError }),
  setRoomId: (roomId) => set({ roomId }),
  setPopularity: (popularity) => set({ popularity }),
  setTotalLikeCount: (count) => set({ totalLikeCount: count }),
  setOnlineCount: (count) => set({ onlineCount: count })
}));
