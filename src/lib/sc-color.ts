/** SC 强调色兜底：B 站 30 元档的蓝色，服务端未下发颜色时使用 */
const SC_ACCENT_FALLBACK = "#2A60B2";

/** #RGB / #RRGGBB 归一化，非法值返回 undefined */
function normalizeHexColor(color?: string): string | undefined {
  if (!color) return undefined;
  const value = color.startsWith("#") ? color : `#${color}`;
  return /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value) ? value : undefined;
}

/**
 * 醒目留言的强调色。
 *
 * 取 `background_bottom_color`：B 站按金额档位下发的饱和色（蓝/橙/红/紫…），
 * 正是原本卡片下半部分的底色，也适合直接当文字色用。
 * 不用 `background_color`（顶栏那层浅色）——它太浅，做文字色看不清。
 */
export function resolveScAccent(item: {
  backgroundColor?: string;
  backgroundBottomColor?: string;
  backgroundPriceColor?: string;
}): string {
  return (
    normalizeHexColor(item.backgroundBottomColor) ??
    normalizeHexColor(item.backgroundPriceColor) ??
    normalizeHexColor(item.backgroundColor) ??
    SC_ACCENT_FALLBACK
  );
}
