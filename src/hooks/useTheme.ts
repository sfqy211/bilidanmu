import { useEffect } from "react";
import { applyVisualTheme } from "@/lib/visual-theme";
import { useSettingsStore } from "@/stores/settings-store";

export function useTheme() {
  const settings = useSettingsStore((state) => state.settings);
  // 背景采样主题覆盖（仅弹幕窗会写）：非空时优先于设置里的 theme
  const override = useSettingsStore((state) => state.backgroundThemeOverride);

  useEffect(() => {
    const effective = override
      ? { ...settings, appearance: { ...settings.appearance, theme: override } }
      : settings;
    const apply = () => applyVisualTheme(effective);
    apply();
    const queries = [window.matchMedia("(prefers-color-scheme: dark)"), window.matchMedia("(prefers-reduced-motion: reduce)")];
    queries.forEach(query => query.addEventListener("change", apply));
    return () => queries.forEach(query => query.removeEventListener("change", apply));
  }, [settings, override]);
}
