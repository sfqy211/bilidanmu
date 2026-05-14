import { create } from "zustand";
import type { DanmakuMessage } from "@/types/danmaku";

interface DanmakuState {
  messages: DanmakuMessage[];
  wsConnected: boolean;
  sentCount: number;
  isMuted: boolean;
  muteRemainSec: number;
  autoSpamRunning: boolean;
  addMessage: (message: DanmakuMessage) => void;
  setWsConnected: (connected: boolean) => void;
}

export const useDanmakuStore = create<DanmakuState>((set) => ({
  messages: [],
  wsConnected: false,
  sentCount: 0,
  isMuted: false,
  muteRemainSec: 0,
  autoSpamRunning: false,
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages.slice(-199), message] })),
  setWsConnected: (wsConnected) => set({ wsConnected })
}));
