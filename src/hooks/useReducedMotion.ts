import { useMediaQuery } from "./useMediaQuery";
import { useSettingsStore } from "@/stores/settings-store";

/** 应用内动效偏好优先于系统「减少动态效果」。 */
export function useReducedMotion() {
  const systemReduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const motion = useSettingsStore((state) => state.settings.appearance.motion);
  if (motion === "enabled") return false;
  if (motion === "reduced") return true;
  return systemReduced;
}
