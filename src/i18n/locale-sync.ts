import { listen } from "@tauri-apps/api/event";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";
import type { Settings } from "@/types/bilibili";
import { i18n } from "./index";
import { resolveLocale } from "./languages";

let readId = 0;
let latestRead: Promise<Settings | undefined>;

async function readSettings(): Promise<Settings | undefined> {
  try {
    return await tauriCommands.settings.get();
  } catch {
    return undefined;
  }
}

export function refreshLocale(): Promise<Settings | undefined> {
  const id = ++readId;
  latestRead = (async () => {
    const settings = await readSettings();
    if (id !== readId) return latestRead;
    if (settings) {
      const locale = resolveLocale(settings.locale);
      await i18n.changeLanguage(locale);
      if (id !== readId) return latestRead;
      document.documentElement.lang = locale;
      useSettingsStore.getState().setLocale(locale);
    }
    return settings;
  })();
  return latestRead;
}

export async function initializeLocale(): Promise<Settings | undefined> {
  const refresh = () => { void refreshLocale(); };
  await listen("locale-changed", refresh).catch(() => undefined);
  window.addEventListener("focus", refresh);
  return refreshLocale();
}
