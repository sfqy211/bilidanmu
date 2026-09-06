import type { Settings } from "@/types/bilibili";

/** 外观设置中 "隐藏xxx" 类型的 checkbox 配置 */
export const HIDE_APPEARANCE_OPTIONS: {
  key: keyof Pick<Settings["appearance"], "hideGloryLevel" | "hideFanMedal" | "hideAdminBadge" | "hideUserIdColor" | "hideUsername" | "hideContributionRank">;
  label: string;
}[] = [
  { key: "hideGloryLevel", label: "荣耀等级" },
  { key: "hideFanMedal", label: "粉丝牌" },
  { key: "hideAdminBadge", label: "房管标志" },
  { key: "hideUserIdColor", label: "昵称颜色" },
  { key: "hideUsername", label: "用户昵称" },
  { key: "hideContributionRank", label: "高能榜" },
];

/** 活动栏（进场/点赞）显示模式选项 — 主页设置与弹幕窗外观面板共用 */
export const ACTIVITY_BAR_MODE_OPTIONS: { value: Settings["appearance"]["activityBarMode"]; label: string }[] = [
  { value: "scroll", label: "滚动列表" },
  { value: "latest", label: "只看最新" },
  { value: "hidden", label: "隐藏" },
];

/** 活动栏内容过滤选项 — 主页设置与弹幕窗外观面板共用 */
export const ACTIVITY_FILTER_OPTIONS: { value: Settings["appearance"]["activityFilter"]; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "entry", label: "只看进场" },
  { value: "like", label: "只看点赞" },
];
