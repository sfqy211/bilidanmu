import type { PriceColors } from "@/types/bilibili";
import type { DanmakuMessage } from "@/types/danmaku";

/** 礼物与舰长按金瓜子计价（1000 金瓜子 = 1 元）；醒目留言的 price 已是人民币 */
const BEANS_PER_YUAN = 1000;

/**
 * 金额档位配色默认值（与 Rust `PriceColors::default()` 一一对应）。
 * 消费端兜底用：旧持久化数据没有 priceColors、或只缺其中几档时，
 * 缺失的档位回退到这里，避免整行颜色变成 `undefined` 而渲染失败。
 */
export const DEFAULT_PRICE_COLORS: PriceColors = {
  scTier1: "#2A60B2",
  scTier2: "#427D9A",
  scTier3: "#E0913F",
  scTier4: "#D4464A",
  scTier5: "#9C3D9C",
  scTier6: "#B01F1F",
  gift: "#B45309",
  guardGovernor: "#F77102",
  guardAdmiral: "#AA3CDD",
  guardCaptain: "#006FE6",
};

/** 六档醒目留言（按金额升序），供解析与设置页共用 */
export const SC_PRICE_TIERS = [
  { key: "scTier1", label: "≤ ¥30", max: 30 },
  { key: "scTier2", label: "¥31 – ¥50", max: 50 },
  { key: "scTier3", label: "¥51 – ¥100", max: 100 },
  { key: "scTier4", label: "¥101 – ¥500", max: 500 },
  { key: "scTier5", label: "¥501 – ¥1000", max: 1000 },
  { key: "scTier6", label: "> ¥1000", max: Number.POSITIVE_INFINITY },
] as const satisfies readonly { key: keyof PriceColors; label: string; max: number }[];

/** 补全缺失档位：用户只配过部分颜色时，其余档位取默认值 */
export function normalizePriceColors(incoming?: Partial<PriceColors>): PriceColors {
  return { ...DEFAULT_PRICE_COLORS, ...(incoming ?? {}) };
}

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

/** 醒目留言按金额落到六档，取对应配置色 */
function scTierColor(price: number, colors: PriceColors): string {
  const tier = SC_PRICE_TIERS.find((item) => price <= item.max) ?? SC_PRICE_TIERS[SC_PRICE_TIERS.length - 1];
  return normalizeHexColor(colors[tier.key]) ?? DEFAULT_PRICE_COLORS[tier.key];
}

/**
 * 消息强调色：醒目留言、礼物、舰长共用一套价格胶囊。
 *
 * 颜色取自用户配置的 `appearance.priceColors`（设置页「外观」可改），
 * SC 按金额落档，礼物与舰长按类型/等级取色。
 */
export function resolveMessageAccent(
  item: DanmakuMessage,
  priceColors?: Partial<PriceColors>,
): string | undefined {
  const colors = normalizePriceColors(priceColors);
  switch (item.type) {
    case "superChat":
      return scTierColor(item.price ?? 0, colors);
    case "gift":
      return normalizeHexColor(colors.gift) ?? DEFAULT_PRICE_COLORS.gift;
    case "guard":
      switch (item.guardLevel) {
        case 1:
          return normalizeHexColor(colors.guardGovernor) ?? DEFAULT_PRICE_COLORS.guardGovernor;
        case 2:
          return normalizeHexColor(colors.guardAdmiral) ?? DEFAULT_PRICE_COLORS.guardAdmiral;
        case 3:
          return normalizeHexColor(colors.guardCaptain) ?? DEFAULT_PRICE_COLORS.guardCaptain;
        default:
          return undefined;
      }
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
