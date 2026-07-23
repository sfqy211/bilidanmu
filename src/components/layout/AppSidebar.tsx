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
    <aside className="flex w-16 flex-col items-center py-3">
      <nav className="flex flex-1 flex-col items-center gap-1.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              cn(
                "group relative flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-xl text-slate-400 transition-all duration-200 hover:bg-black/[0.05] hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-white",
                isActive &&
                  "glass-panel text-pink-500 hover:text-pink-500 dark:text-pink-400 dark:hover:text-pink-400"
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.2 : 1.8} />
                <span
                  className={cn(
                    "text-[9px] leading-none transition-opacity",
                    isActive ? "font-semibold opacity-100" : "opacity-0 group-hover:opacity-70"
                  )}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* 匿名模式指示器 */}
      {isAnonymous && (
        <div className="flex flex-col items-center gap-1 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">
            <Eye className="h-4 w-4" />
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">匿名</span>
        </div>
      )}

      {version && (
        <div className="numeric text-[10px] tracking-wider text-slate-300 dark:text-slate-600">
          {version}
        </div>
      )}
    </aside>
  );
}
