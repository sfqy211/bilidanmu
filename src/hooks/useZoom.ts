import { useCallback, useEffect, useRef } from "react";
import { useSettingsStore } from "@/stores/settings-store";

const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 32;
const STEP = 1;

/**
 * Ctrl + 滚轮调整文字大小 hook。
 * 仅在弹幕和 AI 面板中使用，修改 settings 中的 fontSize。
 */
export function useZoom() {
  const fontSize = useSettingsStore((s) => s.settings.appearance.fontSize);
  const patchSettings = useSettingsStore((s) => s.patchSettings);
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();

      const delta = e.deltaY > 0 ? -STEP : STEP;
      const next = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, fontSizeRef.current + delta));
      if (next !== fontSizeRef.current) {
        patchSettings({ appearance: { fontSize: next } as any });
      }
    },
    [patchSettings]
  );

  useEffect(() => {
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);
}
