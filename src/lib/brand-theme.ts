import type { Settings } from "@/types/bilibili";

/** 默认品牌色的 HSL（与 index.css 静态默认一致） */
const DEFAULT_BRAND_HSL = { light: "0 0% 27%", dark: "0 0% 85%" };

/** 默认品牌色：石墨 Mono（无彩色极简） */
export const DEFAULT_BRAND = { light: "#E11D48", dark: "#FB7185" };

/** 主题色预设（与选色单页一致） */
export const BRAND_PRESETS = [
  { name: "石墨 Mono", light: "#3F3F46", dark: "#D4D4D8" },
  { name: "靛蓝 Indigo", light: "#5661D8", dark: "#7B86F0" },
  { name: "晴空蓝 Sky", light: "#0284C7", dark: "#38BDF8" },
  { name: "薄荷绿 Emerald", light: "#059669", dark: "#34D399" },
  { name: "青碧 Teal", light: "#0D9488", dark: "#2DD4BF" },
  { name: "幽紫 Violet", light: "#7C3AED", dark: "#A78BFA" },
  { name: "玫红 Rose", light: "#E11D48", dark: "#FB7185" },
  { name: "琥珀 Amber", light: "#D97706", dark: "#FBBF24" },
];

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
