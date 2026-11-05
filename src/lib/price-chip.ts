import type { DanmakuMessage } from "@/types/danmaku";

/** 礼物与舰长按金瓜子计价（1000 金瓜子 = 1 元）；醒目留言的 price 已是人民币 */
const BEANS_PER_YUAN = 1000;

/** 醒目留言兜底色：B 站 30 元档的蓝，服务端未下发颜色时使用 */
const SUPER_CHAT_FALLBACK = "#2A60B2";
/** 礼物兜底色：琥珀金，延续弹幕窗里礼物一贯的金色观感 */
const GIFT_ACCENT = "#B45309";

/** 大航海档位色，与昵称着色同一套 */
const GUARD_ACCENT: Record<number, string> = {
  1: "#F77102", // 总督
  2: "#AA3CDD", // 提督
  3: "#006FE6", // 舰长
};

/** #RGB / #RRGGBB 归一化，非法值返回 undefined */
function normalizeHexColor(color?: string): string | undefined {
  if (!color) return undefined;
  const value = color.startsWith("#") ? color : `#${color}`;
  return /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value) ? value : undefined;
}

/** 金额取整规则：大额只留整元，小额保留到分，避免出现 ¥138.00 / ¥0.1 这类毛刺 */
function formatYuan(yuan: number): string {
  if (yuan >= 100) return String(Math.round(yuan));
  if (yuan >= 1) return yuan.toFixed(yuan % 1 === 0 ? 0 : 2);
  return yuan.toFixed(2);
}

/**
 * 消息强调色：醒目留言、礼物、舰长共用一套价格胶囊。
 *
 * - 醒目留言取 `background_bottom_color` —— B 站按金额档位下发的饱和色
 *   （蓝/橙/红/紫…），正是原本卡片下半部分的底色，也适合直接当文字色用。
 *   不用 `background_color`（顶栏那层浅色），它太浅，做文字色看不清。
 * - 礼物固定琥珀金。
 * - 舰长按大航海档位（总督/提督/舰长），与昵称着色一致。
 */
export function resolveMessageAccent(item: DanmakuMessage): string | undefined {
  switch (item.type) {
    case "superChat":
      return (
        normalizeHexColor(item.backgroundBottomColor) ??
        normalizeHexColor(item.backgroundPriceColor) ??
        normalizeHexColor(item.backgroundColor) ??
        SUPER_CHAT_FALLBACK
      );
    case "gift":
      return GIFT_ACCENT;
    case "guard":
      return GUARD_ACCENT[item.guardLevel ?? 0];
    default:
      return undefined;
  }
}

/**
 * 价格胶囊文案（不含货币符号以外的前缀）。
 *
 * 醒目留言的 price 是人民币直传；礼物与舰长是金瓜子的单价，
 * 需乘上数量换算成总价——同一行里 `×2` 的礼物显示单价会让人误读成只花了那么多。
 */
export function formatMessagePrice(item: DanmakuMessage): string | undefined {
  if (!item.price) return undefined;
  if (item.type === "superChat") {
    return `¥${item.price}`;
  }
  const total = item.price * (item.count ?? 1);
  return `¥${formatYuan(total / BEANS_PER_YUAN)}`;
}
