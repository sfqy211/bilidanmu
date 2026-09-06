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
