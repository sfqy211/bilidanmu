import { useEffect, useState } from "react";
import { Bot, MonitorPlay, Settings, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";
import { getAppVersion } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";

export function AppSidebar() {
  const [version, setVersion] = useState("");
  const aiAvailable = useSettingsStore((state) => state.aiAvailable);

  const navItems = [
    { to: "/rooms", label: "直播间", icon: MonitorPlay },
    { to: "/accounts", label: "账号", icon: UserRound },
    ...(aiAvailable ? [{ to: "/ai", label: "AI 接入", icon: Bot }] : []),
    { to: "/settings", label: "设置", icon: Settings }
  ];

  useEffect(() => {
    getAppVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <aside className="flex w-16 flex-col bg-[#f8f8f8] shadow-sm dark:bg-[#0e1018] dark:ring-1 dark:ring-white/[0.06]">
      <nav className="flex flex-1 flex-col gap-2 p-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "group relative flex h-12 items-center justify-center text-slate-400 transition hover:bg-[#ebebeb] hover:text-slate-700 dark:hover:bg-white/[0.04] dark:hover:text-white",
                isActive && "bg-[#ebebeb] text-slate-900 dark:bg-white/[0.08] dark:text-white"
              )
            }
            title={label}
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "absolute left-0 h-8 w-1 bg-pink-500 opacity-0 transition",
                    isActive && "opacity-100"
                  )}
                />
                <Icon className="h-5 w-5" />
              </>
            )}
          </NavLink>
        ))}
      </nav>
      {version && (
        <div className="p-3 text-center text-xs text-slate-400 dark:text-slate-500">{version}</div>
      )}
    </aside>
  );
}
