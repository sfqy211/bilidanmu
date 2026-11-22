import { Bot, Headphones, MonitorPlay, Settings, UserRound } from "lucide-react";
import { useTranslation } from "@/i18n";
import { tauriCommands } from "@/lib/tauri";
import { useUiStore } from "@/stores/ui-store";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

export function AppSidebar() {
  const { t } = useTranslation();
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const setCollapsed = useUiStore((state) => state.setSidebarCollapsed);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    void tauriCommands.selections.save({ sidebarCollapsed: next });
  };

  return (
    <WorkspaceSidebar
      label={t("navigation.main")}
      collapsed={collapsed}
      onToggleCollapsed={toggleCollapsed}
      groups={[{ items: [
        { to: "/rooms", label: t("navigation.live"), icon: MonitorPlay },
        { to: "/accounts", label: t("navigation.accounts"), icon: UserRound },
        { to: "/ai", label: "AI", icon: Bot },
        { to: "/listen", label: t("navigation.videos"), icon: Headphones },
      ] }]}
      utilityItems={[{ to: "/settings", label: t("navigation.settings"), icon: Settings }]}
    />
  );
}
