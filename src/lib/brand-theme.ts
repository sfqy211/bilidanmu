import type { Settings } from "@/types/bilibili";

/** 默认品牌色的 HSL（与 index.css 静态默认一致） */
const DEFAULT_BRAND_HSL = { light: "0 0% 27%", dark: "0 0% 85%" };

/** 默认品牌色：石墨 Mono（无彩色极简） */
export const DEFAULT_BRAND = { light: "#E11D48", dark: "#FB7185" };

/** 一套完整配色：强调 + 背景 + 表面 + 前景 */
export interface ThemePreset {
  id: string;
  name: string;
  accent: string;
  background: string;
  surface: string;
  foreground: string;
}

/**
 * 深色主题预设。每套的四个颜色经过搭配：
 * 背景最暗、表面略亮一档（保证卡片可辨）、前景高对比、强调色与背景有足够区分。
 */
export const DARK_THEME_PRESETS: ThemePreset[] = [
  { id: "midnight", name: "午夜", accent: "#34D399", background: "#111111", surface: "#1F1F1F", foreground: "#FCFCFC" },
  { id: "graphite", name: "石墨", accent: "#D4D4D8", background: "#18181B", surface: "#27272A", foreground: "#FAFAFA" },
  { id: "abyss", name: "深海", accent: "#38BDF8", background: "#0B1220", surface: "#152036", foreground: "#E2E8F0" },
  { id: "violet", name: "暗夜紫", accent: "#A78BFA", background: "#13111C", surface: "#211D2E", foreground: "#EDE9FE" },
  { id: "warm", name: "暖棕", accent: "#FBBF24", background: "#1A1512", surface: "#292119", foreground: "#F5EDE4" },
  { id: "forest", name: "深林", accent: "#4ADE80", background: "#0E1612", surface: "#1A2620", foreground: "#E8F5EE" },
];

/** 浅色主题预设：背景偏米白/浅灰，表面更浅或纯白，前景深色 */
export const LIGHT_THEME_PRESETS: ThemePreset[] = [
  { id: "paper", name: "素纸", accent: "#E11D48", background: "#F2F2F4", surface: "#FFFFFF", foreground: "#1B1B1F" },
  { id: "mist", name: "雾灰", accent: "#3F3F46", background: "#ECECEE", surface: "#F8F8F9", foreground: "#18181B" },
  { id: "sky", name: "晴空", accent: "#0284C7", background: "#EEF4FA", surface: "#FFFFFF", foreground: "#15202B" },
  { id: "mint", name: "薄荷", accent: "#059669", background: "#EDF6F1", surface: "#FFFFFF", foreground: "#14211B" },
  { id: "sand", name: "暖沙", accent: "#D97706", background: "#F7F3ED", surface: "#FFFDF9", foreground: "#241B12" },
  { id: "candy", name: "樱粉", accent: "#DB2777", background: "#FBF0F5", surface: "#FFFFFF", foreground: "#2A1520" },
];

/** 当前模式下可用的主题预设 */
export function themePresets(mode: "light" | "dark"): ThemePreset[] {
  return mode === "dark" ? DARK_THEME_PRESETS : LIGHT_THEME_PRESETS;
}

/** hex → "r g b" 三元组（供 rgb(var(--brand-rgb) / alpha) 使用） */
export function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return `${(num >> 16) & 255} ${(num >> 8) & 255} ${num & 255}`;
}

/** hex → "H S% L%"（供 shadcn 的 hsl(var(--primary)) 使用） */
export function hexToHslString(hex: string): string {
  const [r, g, b] = hexToRgbTriplet(hex).split(" ").map((v) => Number(v) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** 按亮度返回在品牌色上的可读文字颜色 */
export function contrastFor(hex: string): string {
  const [r, g, b] = hexToRgbTriplet(hex).split(" ").map(Number);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#18181b" : "#ffffff";
}

/** 把设置中的品牌色写入 CSS 变量（亮暗两套，模式由样式表分流） */
export function applyBrandTheme(settings: Settings | null | undefined) {
  const light = settings?.appearance.themeAccentLight || DEFAULT_BRAND.light;
  const dark = settings?.appearance.themeAccentDark || DEFAULT_BRAND.dark;
  const root = document.documentElement;
  root.style.setProperty("--brand-rgb-light", hexToRgbTriplet(light));
  root.style.setProperty("--brand-rgb-dark", hexToRgbTriplet(dark));
  root.style.setProperty("--brand-contrast-light", contrastFor(light));
  root.style.setProperty("--brand-contrast-dark", contrastFor(dark));
  // shadcn 组件（Select 焦点环等）经由 hsl(var(--primary)) 消费主题色
  root.style.setProperty("--primary-hsl-light", hexToHslString(light));
  root.style.setProperty("--primary-hsl-dark", hexToHslString(dark));
  root.style.setProperty("--ring-hsl-light", hexToHslString(light));
  root.style.setProperty("--ring-hsl-dark", hexToHslString(dark));
}
