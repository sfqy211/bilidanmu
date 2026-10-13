import type { VisualProfile, VisualSetting } from "@/types/bilibili";

const profile: VisualProfile = {
  accent: "", background: "", foreground: "",
  fontFamily: "system", contentFontFamily: "inherit",
};

export const DEFAULT_VISUAL: VisualSetting = {
  light: { ...profile }, dark: { ...profile },
  uiFontSize: 14, contentFontSize: 14,
  contrast: 40,
};

export function normalizeVisual(base: VisualSetting, incoming: Partial<VisualSetting> = {}): VisualSetting {
  const clamp = (value: number, min: number, max: number, fallback: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
  const profile = (source: Partial<VisualProfile> | undefined, fallback: VisualProfile): VisualProfile => {
    const merged = { ...fallback, ...source };
    if (!["system", "yahei", "dengxian", "serif"].includes(merged.fontFamily)) merged.fontFamily = "system";
    if (!["inherit", "system", "yahei", "dengxian", "serif"].includes(merged.contentFontFamily)) merged.contentFontFamily = "inherit";
    for (const key of ["accent", "background", "foreground"] as const) {
      if (!/^#[\da-f]{6}$/i.test(merged[key])) merged[key] = "";
    }
    return merged;
  };
  // 逐字段搬运，顺带丢弃已下线的旧外观字段（如全宽页面、半透明侧栏）。
  return {
    light: profile(incoming.light, base.light),
    dark: profile(incoming.dark, base.dark),
    uiFontSize: clamp(incoming.uiFontSize ?? base.uiFontSize, 12, 20, 14),
    contentFontSize: clamp(incoming.contentFontSize ?? base.contentFontSize, 12, 24, 14),
    contrast: clamp(incoming.contrast ?? base.contrast, 0, 100, 40),
  };
}
