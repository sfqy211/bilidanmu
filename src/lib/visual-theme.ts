import type { Settings, VisualFont, VisualProfile } from "@/types/bilibili";
import { applyBrandTheme, DEFAULT_BRAND, hexToHslString } from "./brand-theme";
import { applyTheme } from "./theme";

export const FONT_OPTIONS = [
  { value: "system", label: "系统" }, { value: "yahei", label: "微软雅黑" },
  { value: "dengxian", label: "等线" }, { value: "serif", label: "宋体" },
] as const;
const FONTS: Record<VisualFont, string> = {
  system: '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif',
  yahei: '"Microsoft YaHei", "Segoe UI", sans-serif',
  dengxian: 'DengXian, "Microsoft YaHei", sans-serif',
  serif: 'SimSun, "Songti SC", serif',
};

/** 未自定义时的兜底配色：浅色米白 / 深色墨蓝 */
const FALLBACK_COLORS = {
  light: { background: "#EAEAEC", foreground: "#1B1B1F" },
  dark: { background: "#202024", foreground: "#E8E8EA" },
};
export const isHexColor = (value: string) => /^#[\da-f]{6}$/i.test(value);

export function resolveVisualProfile(settings: Settings, mode: "light" | "dark"): VisualProfile {
  const profile = settings.visual[mode];
  const legacyAccent = mode === "light" ? settings.appearance.themeAccentLight : settings.appearance.themeAccentDark;
  const fallbackAccent = mode === "light" ? DEFAULT_BRAND.light : DEFAULT_BRAND.dark;
  return { ...profile,
    background: isHexColor(profile.background) ? profile.background : FALLBACK_COLORS[mode].background,
    foreground: isHexColor(profile.foreground) ? profile.foreground : FALLBACK_COLORS[mode].foreground,
    accent: isHexColor(profile.accent) ? profile.accent : isHexColor(legacyAccent) ? legacyAccent : fallbackAccent,
  };
}

function mix(first: string, second: string, amount: number) {
  const channels = [1, 3, 5].map(index => Math.round(parseInt(first.slice(index, index + 2), 16) * (1 - amount)
    + parseInt(second.slice(index, index + 2), 16) * amount).toString(16).padStart(2, "0"));
  return `#${channels.join("")}`;
}

/** 每个窗口共用同一份外观设置；透明弹幕窗的底色仍由自己的透明度设置管理。 */
export function applyVisualTheme(settings: Settings) {
  const dark = applyTheme(settings.appearance.theme);
  const root = document.documentElement;
  const visual = settings.visual;
  const profile = resolveVisualProfile(settings, dark ? "dark" : "light");
  const light = resolveVisualProfile(settings, "light"), darkProfile = resolveVisualProfile(settings, "dark");
  applyBrandTheme({ ...settings, appearance: { ...settings.appearance, themeAccentLight: light.accent, themeAccentDark: darkProfile.accent } });
  const mutedAmount = (60 + (visual.contrast - 40) * 0.35) / 100;
  const border = mix(profile.background, profile.foreground, (4 + visual.contrast * 0.1) / 100);
  const card = dark ? mix(profile.background, profile.foreground, 0.04) : mix(profile.background, "#FFFFFF", 0.55);
  const contentFontFamily = profile.contentFontFamily === "inherit" ? profile.fontFamily : profile.contentFontFamily;
  const values: Record<string, string> = {
    "--app-page": profile.background, "--app-card": card, "--ink": profile.foreground,
    "--ink-muted": mix(profile.background, profile.foreground, mutedAmount), "--border-subtle": border,
    "--background": hexToHslString(profile.background), "--foreground": hexToHslString(profile.foreground),
    "--card": hexToHslString(card), "--card-foreground": hexToHslString(profile.foreground),
    "--secondary": hexToHslString(card), "--secondary-foreground": hexToHslString(profile.foreground),
    "--muted": hexToHslString(card), "--muted-foreground": hexToHslString(mix(profile.background, profile.foreground, mutedAmount)),
    "--border": hexToHslString(border), "--input": hexToHslString(border),
    "--ui-font-family": FONTS[profile.fontFamily],
    "--content-font-family": FONTS[contentFontFamily],
    "--ui-font-size": `${visual.uiFontSize}px`, "--content-font-size": `${visual.contentFontSize}px`,
  };
  for (const [key, value] of Object.entries(values)) root.style.setProperty(key, value);
  // 减少动态效果固定跟随系统无障碍设置，不再作为可调项。
  root.dataset.reducedMotion = String(matchMedia("(prefers-reduced-motion: reduce)").matches);
}
