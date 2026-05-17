import { create } from "zustand";
import type { Settings } from "@/types/bilibili";

export const defaultSettings: Settings = {
  sendInterval: { min: 1.5, max: 3 },
  rateLimit: { maxPerWindow: 20, windowSec: 30 },
  riskControl: {
    randomInterval: true,
    jitter: true,
    autoPauseOnMute: true,
    appendRandomSuffix: false
  },
  receive: {
    autoConnect: true,
    autoReconnect: true,
    reconnectInterval: 5,
    maxReconnectInterval: 60
  },
  appearance: {
    theme: "system",
    fontSize: 14,
    showMedal: true,
    showLevel: true
  },
  notification: {
    muteAlert: true,
    cookieExpiry: true,
    sendSuccess: false,
    scAlert: false
  },
  stt: {
    enabled: false,
    modelId: "large",
    syncDelayMs: 0
  }
};

interface SettingsState {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  patchSettings: (partial: Partial<Settings>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: defaultSettings,
  setSettings: (settings) => set({ settings }),
  patchSettings: (partial) =>
    set((state) => ({
      settings: {
        ...state.settings,
        ...partial,
        sendInterval: {
          ...state.settings.sendInterval,
          ...partial.sendInterval
        },
        rateLimit: {
          ...state.settings.rateLimit,
          ...partial.rateLimit
        },
        riskControl: {
          ...state.settings.riskControl,
          ...partial.riskControl
        },
        receive: {
          ...state.settings.receive,
          ...partial.receive
        },
        appearance: {
          ...state.settings.appearance,
          ...partial.appearance
        },
        notification: {
          ...state.settings.notification,
          ...partial.notification
        },
        stt: {
          ...state.settings.stt,
          ...partial.stt
        }
      }
    }))
}));
