import type { Settings } from "@/types/bilibili";

export type ThemeMode = Settings["appearance"]["theme"];

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getThemeStorageKey(): string | null {
  return document.documentElement.dataset.themeStorageKey ?? null;
}

export function getStoredTheme(): ThemeMode | null {
  try {
    const storageKey = getThemeStorageKey();
    const stored = storageKey ? localStorage.getItem(storageKey) : null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // ignore
  }
  return null;
}

export function applyTheme(theme: ThemeMode): boolean {
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";

  try {
    const storageKey = getThemeStorageKey();
    if (storageKey && localStorage.getItem(storageKey) !== theme) {
      localStorage.setItem(storageKey, theme);
    }
  } catch {
    // ignore
  }

  return dark;
}
