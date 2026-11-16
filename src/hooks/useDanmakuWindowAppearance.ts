import type { CSSProperties } from "react";
import { useBackgroundTheme } from "@/hooks/useBackgroundTheme";
import { contrastFor, hexToRgbTriplet } from "@/lib/brand-theme";
import { useSettingsStore } from "@/stores/settings-store";

/** 直播与视频窗口共用背景跟随和强调色，覆盖限定在各自的窗口内容中。 */
export function useDanmakuWindowAppearance() {
  useBackgroundTheme();
  const windowStyle = useSettingsStore(
    (state) => state.settings.appearance.danmakuWindow,
  );
  if (
    windowStyle.accentMode !== "custom" ||
    !/^#[\da-fA-F]{6}$/.test(windowStyle.accentColor)
  )
    return undefined;
  return {
    "--brand-rgb": hexToRgbTriplet(windowStyle.accentColor),
    "--brand-contrast": contrastFor(windowStyle.accentColor),
  } as CSSProperties;
}
