import { useEffect } from "react";
import { applyVisualTheme } from "@/lib/visual-theme";
import { useSettingsStore } from "@/stores/settings-store";

export function useTheme() {
  const settings = useSettingsStore((state) => state.settings);

  useEffect(() => {
    const apply = () => applyVisualTheme(settings);
    apply();
    const queries = [window.matchMedia("(prefers-color-scheme: dark)"), window.matchMedia("(prefers-reduced-motion: reduce)")];
    queries.forEach(query => query.addEventListener("change", apply));
    return () => queries.forEach(query => query.removeEventListener("change", apply));
  }, [settings]);
}
