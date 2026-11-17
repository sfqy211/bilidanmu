import { Bot, Headphones, MonitorPlay, Settings, UserRound } from "lucide-react";
import { tauriCommands } from "@/lib/tauri";
import { useUiStore } from "@/stores/ui-store";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

export function AppSidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const setCollapsed = useUiStore((state) => state.setSidebarCollapsed);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    void tauriCommands.selections.save({ sidebarCollapsed: next });
  };

  return (
    <WorkspaceSidebar
      label="主导航"
      collapsed={collapsed}
      onToggleCollapsed={toggleCollapsed}
      groups={[{ items: [
        { to: "/rooms", label: "直播", icon: MonitorPlay },
        { to: "/accounts", label: "账号", icon: UserRound },
        { to: "/ai", label: "AI", icon: Bot },
        { to: "/listen", label: "视频", icon: Headphones },
      ] }]}
      utilityItems={[{ to: "/settings", label: "设置", icon: Settings }]}
    />
  );
}
