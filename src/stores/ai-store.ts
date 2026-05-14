import { create } from "zustand";
import type { AIModel } from "@/types/bilibili";

interface AIState {
  models: AIModel[];
  currentModelId: string | null;
  setModels: (models: AIModel[]) => void;
  setCurrentModelId: (id: string | null) => void;
}

export const useAIStore = create<AIState>((set) => ({
  models: [],
  currentModelId: null,
  setModels: (models) => set({ models }),
  setCurrentModelId: (currentModelId) => set({ currentModelId })
}));
