import { useMediaQuery } from "./useMediaQuery";

/** 减少动态效果固定跟随系统无障碍设置。 */
export function useReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
