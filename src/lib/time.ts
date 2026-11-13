/** 秒 → `hh:mm:ss`。
 *
 * 播放页（进度条两端、播放列表里的分 P 时长）统一使用时分秒，即使不足一小时也补齐
 * 小时位：同一页里混用 `mm:ss` 与 `h:mm:ss` 会让两端的数字宽度跳动，看起来像错位。
 */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}
