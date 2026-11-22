/** 外观设置中 "隐藏xxx" 类型的 checkbox 配置 */
export const HIDE_APPEARANCE_KEYS = [
  "hideGloryLevel", "hideFanMedal", "hideAdminBadge",
  "hideUserIdColor", "hideUsername", "hideContributionRank",
] as const;

/** 活动栏（进场/点赞）显示模式选项 — 主页设置与弹幕窗外观面板共用 */
export const ACTIVITY_BAR_MODES = ["scroll", "latest", "hidden"] as const;

/** 活动栏内容过滤选项 — 主页设置与弹幕窗外观面板共用 */
export const ACTIVITY_FILTERS = ["all", "entry", "like"] as const;
