import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** unix 秒时间戳 → 本地时间 HH:MM（withSeconds 时到 HH:MM:SS），空值返回空串 */
export function formatTimestamp(ts?: number, withSeconds = false): string {
  if (!ts) return "";
  const date = new Date(ts * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return withSeconds ? `${clock}:${pad(date.getSeconds())}` : clock;
}

/** unix 秒时间戳 → 本地完整时间 YYYY-MM-DD HH:MM:SS（右键菜单里展示用），空值返回空串 */
export function formatDateTime(ts?: number): string {
  if (!ts) return "";
  const date = new Date(ts * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${formatTimestamp(ts, true)}`;
}

/**
 * 解析 B 站弹幕气泡配色：`#AARRGGBB,#AARRGGBB,#AARRGGBB`（起始 / 结束 / 边框）。
 *
 * 注意是 **Android 的 AARRGGBB**，不是 Web 的 RRGGBBAA——B 站的下发值如
 * `#1453BAFF` 拆成 A=0x14(8%) R=0x53 G=0xBA B=0xFF，即 8% 不透明的浅蓝；
 * 若按 Web 顺序读会得到「完全不透明的深蓝」，颜色和观感全错。
 * 同一用户的三段色常用同一个 RGB、只递增 Alpha，正是渐变起止的正确形态。
 *
 * 段数不足时退化为纯色；任一颜色非法则整条作废（返回 undefined），
 * 避免把半截颜色塞进 CSS 导致整条弹幕背景变成透明或黑色。
 */
export function parseBubbleColor(
  raw?: string,
): { start: string; end: string; border?: string } | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;

  // AARRGGBB 需要 8 位；6 位按普通 RRGGBB 原样透传（不带 alpha）
  const toCss = (value: string): string | undefined => {
    const hex = value.replace(/^#/, "");
    if (/^[\da-f]{8}$/i.test(hex)) {
      // AARRGGBB -> #RRGGBBAA（CSS 顺序）
      return `#${hex.slice(2)}${hex.slice(0, 2)}`.toLowerCase();
    }
    if (/^[\da-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
    return undefined;
  };

  const converted = parts.map(toCss);
  if (converted.some((value) => value === undefined)) return undefined;

  const [start, end, border] = converted as string[];
  return { start, end: end ?? start, border };
}
