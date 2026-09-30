import { Bot, MonitorPlay, Settings, UserRound } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

export function AppSidebar() {
  const isAnonymous = useAuthStore((state) => state.isAnonymous);
  return (
    <WorkspaceSidebar label="直播导航" status={isAnonymous ? "匿名模式" : undefined}
      items={[
        { to: "/rooms", label: "直播间", icon: MonitorPlay },
        { to: "/accounts", label: "账号", icon: UserRound },
        { to: "/ai", label: "AI 接入", icon: Bot },
      ]}
      utilityItems={[{ to: "/settings", label: "设置", icon: Settings }]} />
  );
}
