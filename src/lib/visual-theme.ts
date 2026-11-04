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
  const background = isHexColor(profile.background) ? profile.background : FALLBACK_COLORS[mode].background;
  const foreground = isHexColor(profile.foreground) ? profile.foreground : FALLBACK_COLORS[mode].foreground;
  return { ...profile,
    background,
    foreground,
    // 卡片色留空时按背景推导，见 applyVisualTheme
    card: isHexColor(profile.card) ? profile.card : "",
    accent: resolveAccent(settings, mode),
  };
}

/**
 * 卡片/面板底色。用户显式配置则用之，否则从背景推导：
 * 暗色稍微提亮一点、浅色稍微压暗一点，让卡片与页面底色拉开层次。
 * 若背景是纯黑/纯白这类极端值，推导结果几乎同色，层次会消失——
 * 这种情况下改为反向微调，保证卡片始终可见。
 */
export function resolveCardColor(background: string, foreground: string, dark: boolean, card: string): string {
  if (isHexColor(card)) return card;
  const derived = dark
    ? mix(background, foreground, 0.06)
    : mix(background, "#FFFFFF", 0.55);
  // 与背景几乎同色时（对比不足）改为朝前景方向多推一点，确保卡片可辨
  if (contrastGap(derived, background) < 0.03) {
    return mix(background, foreground, dark ? 0.12 : 0.08);
  }
  return derived;
}

/** 两个 hex 的亮度差绝对值，用于判断是否有足够层次 */
function contrastGap(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return (0.299 * r + 0.587 * g + 0.114 * bl) / 255;
  };
  return Math.abs(lum(a) - lum(b));
}

/**
 * 强调色取值。亮/暗两套是分别配置的，但用户通常只调过其中一套：
 * - 本模式配过 → 用它
 * - 本模式没配过、另一模式配过 → 沿用另一模式（跨模式继承）
 *   否则「跟随屏幕背景」一旦把主题从暗切到亮，强调色会跳回默认粉，
 *   用户看到的就是"我的灰色变粉色了"
 * - 都没配过 → legacy 字段 → 默认品牌色
 *
 * 注意：这里必须看**原始存储值**而不是 resolveVisualProfile 的结果，
 * 因为后者会把空值填充成默认色，从而丢失"用户没配过"这一信息。
 */
export function resolveAccent(settings: Settings, mode: "light" | "dark"): string {
  // 本模式配过就直接用。注意不能因为"值恰好等于默认品牌色"就忽略——
  // 主题预设里就有一套 accent 与默认色相同（浅色「素纸」= #E11D48），
  // 那样会让用户选了预设却显示为自定义。
  const own = settings.visual[mode]?.accent;
  if (isHexColor(own)) return own;

  const other = mode === "light" ? settings.visual.dark?.accent : settings.visual.light?.accent;
  if (isHexColor(other)) return other;

  const legacyAccent = mode === "light" ? settings.appearance.themeAccentLight : settings.appearance.themeAccentDark;
  if (isHexColor(legacyAccent)) return legacyAccent;

  return mode === "light" ? DEFAULT_BRAND.light : DEFAULT_BRAND.dark;
}

function mix(first: string, second: string, amount: number) {
  const channels = [1, 3, 5].map(index => Math.round(parseInt(first.slice(index, index + 2), 16) * (1 - amount)
    + parseInt(second.slice(index, index + 2), 16) * amount).toString(16).padStart(2, "0"));
  return `#${channels.join("")}`;
}

/** #RRGGBB → rgba(...)，用于需要保留透明度的毛玻璃底色 */
function toRgba(hex: string, alpha: number) {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  const card = resolveCardColor(profile.background, profile.foreground, dark, profile.card);
  const contentFontFamily = profile.contentFontFamily === "inherit" ? profile.fontFamily : profile.contentFontFamily;
  const values: Record<string, string> = {
    "--app-page": profile.background, "--app-surface": card, "--ink": profile.foreground,
    // 侧栏底色：比内容区略浅/略深一档，形成"操作栏 + 内容区"的层次（ChatGPT 式）。
    // 亮色让侧栏略灰于白色内容区，暗色让侧栏略亮于纯黑内容区。
    "--app-sidebar": mix(profile.background, profile.foreground, dark ? 0.055 : 0.035),
    "--ink-muted": mix(profile.background, profile.foreground, mutedAmount), "--border-subtle": border,
    "--background": hexToHslString(profile.background), "--foreground": hexToHslString(profile.foreground),
    "--card": hexToHslString(card), "--card-foreground": hexToHslString(profile.foreground),
    "--secondary": hexToHslString(card), "--secondary-foreground": hexToHslString(profile.foreground),
    "--muted": hexToHslString(card), "--muted-foreground": hexToHslString(mix(profile.background, profile.foreground, mutedAmount)),
    "--border": hexToHslString(border), "--input": hexToHslString(border),
    "--ui-font-family": FONTS[profile.fontFamily],
    "--content-font-family": FONTS[contentFontFamily],
    "--ui-font-size": `${visual.uiFontSize}px`, "--content-font-size": `${visual.contentFontSize}px`,
    // 侧边吸附收起条：由当前主题的卡片色/前景色推导，跟随主题切换与自定义配色。
    // 用 rgba 保留毛玻璃通透感；暗色比原来的 slate-900/75 浅一档。
    "--dock-bar-bg": toRgba(card, dark ? 0.55 : 0.62),
    "--dock-bar-bg-hover": toRgba(mix(card, profile.foreground, 0.06), dark ? 0.75 : 0.82),
    "--dock-bar-border": toRgba(profile.foreground, dark ? 0.08 : 0.1),
    "--dock-bar-mark": toRgba(profile.foreground, dark ? 0.3 : 0.28),
    "--dock-bar-shadow": dark
      ? "0 1px 2px rgba(0, 0, 0, 0.24), 0 8px 22px -12px rgba(0, 0, 0, 0.40)"
      : "0 1px 2px rgba(15, 23, 42, 0.06), 0 6px 18px -10px rgba(15, 23, 42, 0.18)",
  };
  for (const [key, value] of Object.entries(values)) root.style.setProperty(key, value);
  // 减少动态效果固定跟随系统无障碍设置，不再作为可调项。
  root.dataset.reducedMotion = String(matchMedia("(prefers-reduced-motion: reduce)").matches);
}
