import { useEffect, useState } from "react";
import { Bot, Eye, MonitorPlay, Settings, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";
import { getAppVersion } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";

export function AppSidebar() {
  const [version, setVersion] = useState("");
  const aiAvailable = useSettingsStore((state) => state.aiAvailable);
  const isAnonymous = useAuthStore((state) => state.isAnonymous);

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
    <aside className="flex w-12 flex-col bg-white shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
      <nav className="flex flex-1 flex-col items-center gap-1 py-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "group relative flex h-10 w-10 items-center justify-center rounded text-slate-400 transition-colors hover:bg-black/[0.04] hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-white",
                isActive && "bg-black/[0.06] text-slate-900 dark:bg-white/[0.08] dark:text-white"
              )
            }
            title={label}
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-pink-500 opacity-0 transition-opacity",
                    isActive && "opacity-100"
                  )}
                />
                <Icon className="h-5 w-5" />
              </>
            )}
          </NavLink>
        ))}
      </nav>
      {/* 匿名模式指示器 */}
      {isAnonymous && (
        <div className="flex flex-col items-center gap-1 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">
            <Eye className="h-4 w-4" />
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">匿名</span>
        </div>
      )}
      {version && (
        <div className="p-3 text-center text-[11px] text-slate-400 dark:text-slate-500">{version}</div>
      )}
    </aside>
  );
}
