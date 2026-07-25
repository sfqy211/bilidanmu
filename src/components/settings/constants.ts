import type { Settings } from "@/types/bilibili";

/** 外观设置中 "隐藏xxx" 类型的 checkbox 配置 */
export const HIDE_APPEARANCE_OPTIONS: {
  key: keyof Pick<Settings["appearance"], "hideGloryLevel" | "hideFanMedal" | "hideAdminBadge" | "hideUserIdColor" | "hideEntryMessage" | "hideLikeMessage" | "hideContributionRank">;
  label: string;
}[] = [
  { key: "hideGloryLevel", label: "荣耀等级" },
  { key: "hideFanMedal", label: "粉丝牌" },
  { key: "hideAdminBadge", label: "房管标志" },
  { key: "hideUserIdColor", label: "昵称颜色" },
  { key: "hideContributionRank", label: "高能榜" },
  { key: "hideEntryMessage", label: "入场信息" },
  { key: "hideLikeMessage", label: "点赞信息" },
];
