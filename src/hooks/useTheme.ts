import { useEffect } from "react";
import { applyTheme } from "@/lib/theme";
import { useSettingsStore } from "@/stores/settings-store";

export function useTheme() {
  const theme = useSettingsStore((state) => state.settings.appearance.theme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme(theme);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);
}
