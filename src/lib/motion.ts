import type { MotionSetting } from "@/types/bilibili";

/** 系统无障碍设置「减少动态效果」（Windows 上对应「辅助功能 → 视觉效果 → 动画效果」）。 */
export function systemPrefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 应用内偏好优先于系统：
 * - enabled：强制开启动效（即使 Windows 关了动画）
 * - reduced：强制关闭动效
 * - system：跟随系统
 */
export function prefersReducedMotion(motion: MotionSetting | undefined) {
  if (motion === "enabled") return false;
  if (motion === "reduced") return true;
  return systemPrefersReducedMotion();
}

/** 把动效偏好写到 html[data-reduced-motion]，全局 CSS 以此关闭过渡与动画。 */
export function applyMotionPreference(motion: MotionSetting | undefined) {
  document.documentElement.dataset.reducedMotion = String(prefersReducedMotion(motion));
}
