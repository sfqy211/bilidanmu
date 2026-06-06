import type { Medal } from "@/types/danmaku";

/** 等级分档颜色映射（参考 danmu_vue 项目） */
const TIER_COLORS: Record<number, string> = {
  1: "#5963A5", // 1-10  蓝紫
  2: "#C474A4", // 11-20 粉紫
  3: "#4AB3E7", // 21-30 浅蓝
  4: "#5781E4", // 31-40 蓝
  5: "#A779E6", // 41-50 紫
  6: "#E05673", // 51-60 红
  7: "#F08632", // 60+   橙
};

const UNLIGHTED_COLOR = "#919298";

function getTierColor(level: number): string {
  if (level <= 10) return TIER_COLORS[1];
  if (level <= 20) return TIER_COLORS[2];
  if (level <= 30) return TIER_COLORS[3];
  if (level <= 40) return TIER_COLORS[4];
  if (level <= 50) return TIER_COLORS[5];
  if (level <= 60) return TIER_COLORS[6];
  return TIER_COLORS[7];
}

/**
 * 粉丝勋章卡片
 * 颜色根据等级分档，不依赖 API 返回的颜色值。
 * 未点亮时显示灰色。
 */
export function MedalBadge({ medal, scale = 1 }: { medal: Medal; scale?: number }) {
  const bgColor = medal.isLight ? getTierColor(medal.level) : UNLIGHTED_COLOR;

  return (
    <span
      className="mr-2 inline-flex items-center border leading-tight"
      style={{
        backgroundColor: bgColor,
        borderColor: bgColor,
        color: "#fff",
        fontSize: Math.round(11 * scale),
        padding: `${2 * scale}px ${6 * scale}px`,
      }}
    >
      <span>{medal.name}</span>
      <span className="ml-0.5 font-bold">{medal.level}</span>
    </span>
  );
}
