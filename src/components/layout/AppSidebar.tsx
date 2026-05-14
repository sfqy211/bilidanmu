import { Bot, MonitorPlay, Settings, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";
import { APP_VERSION } from "@/lib/constants";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/rooms", label: "直播间", icon: MonitorPlay },
  { to: "/accounts", label: "账号", icon: UserRound },
  { to: "/ai", label: "AI 接入", icon: Bot },
  { to: "/settings", label: "设置", icon: Settings }
];

export function AppSidebar() {
  return (
    <aside className="flex w-16 flex-col border-r border-white/10 bg-slate-950/80">
      <div className="flex h-16 items-center justify-center border-b border-white/10 text-lg font-semibold text-pink-400">
        BD
      </div>
      <nav className="flex flex-1 flex-col gap-2 p-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "group relative flex h-12 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/5 hover:text-white",
                isActive && "bg-white/10 text-white"
              )
            }
            title={label}
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "absolute left-0 h-8 w-1 rounded-r-full bg-pink-500 opacity-0 transition",
                    isActive && "opacity-100"
                  )}
                />
                <Icon className="h-5 w-5" />
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3 text-center text-xs text-slate-500">{APP_VERSION}</div>
    </aside>
  );
}
