import { create } from "zustand";
import type { AiSuggestion } from "@/types/bilibili";

interface AiState {
  summaries: AiSuggestion[];
  addSummary: (summary: AiSuggestion) => void;
  clearSummaries: (roomId?: number) => void;
}

const MAX_SUMMARIES = 10;

export const useAiStore = create<AiState>((set) => ({
  summaries: [],
  addSummary: (summary) =>
    set((state) => {
      const next = [...state.summaries, summary];
      return { summaries: next.length > MAX_SUMMARIES ? next.slice(-MAX_SUMMARIES) : next };
    }),
  clearSummaries: (roomId) =>
    set((state) => ({
      summaries: roomId != null
        ? state.summaries.filter((s) => s.roomId !== roomId)
        : [],
    })),
}));
