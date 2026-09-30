import { useLocation } from "react-router-dom";

/** 设置是通用页面，沿用其历史记录中保存的来源模式。 */
export function useWorkspaceMode(): "live" | "listen" {
  const { pathname, state } = useLocation();
  if (pathname.startsWith("/listen")) return "listen";
  if (pathname === "/settings" && state?.workspaceMode === "listen") return "listen";
  return "live";
}
