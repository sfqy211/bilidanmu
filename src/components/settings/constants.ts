import type { Settings } from "@/types/bilibili";

/** 外观设置中 "隐藏xxx" 类型的 checkbox 配置 */
export const HIDE_APPEARANCE_OPTIONS: {
  key: keyof Pick<Settings["appearance"], "hideGloryLevel" | "hideFanMedal" | "hideAdminBadge" | "hideUserIdColor">;
  label: string;
}[] = [
  { key: "hideGloryLevel", label: "隐藏荣耀等级" },
  { key: "hideFanMedal", label: "隐藏粉丝牌" },
  { key: "hideAdminBadge", label: "隐藏房管标志" },
  { key: "hideUserIdColor", label: "隐藏用户ID颜色区分" },
];
