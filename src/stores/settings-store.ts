import { create } from "zustand";
import { emit } from "@tauri-apps/api/event";
import { tauriCommands } from "@/lib/tauri";
import type { Settings } from "@/types/bilibili";

/** 需要深合并的子对象键 */
const DEEP_KEYS = [
  "sendInterval", "rateLimit", "riskControl", "receive",
  "appearance", "notification", "cache", "audio", "stt", "filter", "window",
] as const;

/** 将部分设置与默认值深合并，确保所有子对象字段完整 */
function mergeSettings(base: Settings, incoming: Partial<Settings>): Settings {
  const merged = { ...base, ...incoming };
  for (const key of DEEP_KEYS) {
    const k = key as keyof Settings;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 跨 key 联合类型无法静态推断
    (merged as Settings)[k] = { ...base[k], ...incoming[k] } as any;
  }
  return merged;
}

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
    showLevel: true,
    hideGloryLevel: false,
    hideFanMedal: false,
    hideAdminBadge: false,
    hideUserIdColor: false,
    hideEntryMessage: false,
    opacity: 90
  },
  notification: {
    muteAlert: true,
    cookieExpiry: true,
    sendSuccess: false,
    scAlert: false
  },
  cache: {
    danmakuLimit: 200,
    giftLimit: 100
  },
  audio: {
    defaultVolume: 80,
    autoPlay: false
  },
  stt: {
    enabled: false,
    modelId: "large",
    syncDelayMs: 0
  },
  filter: {
    blockedUsers: [],
    blockedKeywords: []
  },
  window: {
    autoHideMain: true
  }
};

interface SettingsState {
  settings: Settings;
  sttAvailable: boolean;
  aiAvailable: boolean;
  setSettings: (settings: Settings) => void;
  setSttAvailable: (available: boolean) => void;
  setAiAvailable: (available: boolean) => void;
  patchSettings: (partial: Partial<Settings>) => void;
  saveSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: defaultSettings,
  sttAvailable: true, // optimistic default; updated on app init
  aiAvailable: false, // conservative default; set to true on app init if ai feature enabled
  setSettings: (settings) => set({
    settings: mergeSettings(defaultSettings, settings),
  }),
  setSttAvailable: (sttAvailable) => set({ sttAvailable }),
  setAiAvailable: (aiAvailable) => set({ aiAvailable }),
  patchSettings: (partial) => {
    set((state) => ({
      settings: mergeSettings(state.settings, partial),
    }));
    // 通知其他窗口设置已变更
    const { settings } = useSettingsStore.getState();
    emit("settings-changed", settings).catch(() => {});
  },
  saveSettings: async () => {
    const { settings } = useSettingsStore.getState();
    await tauriCommands.settings.update(settings);
  }
}));
