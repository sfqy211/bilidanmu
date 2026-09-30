import { useLocation, useNavigate } from "react-router-dom";
import { Headphones, MonitorPlay } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 全局模式切换（软件左上角标题栏内，Tree 风格）：看直播 / 听视频。
 * 点击在两个模式间来回切换整个工作区；两个模式的首页在切换时重新挂载，
 * 数据随之刷新。
 */
export function ModeToggle() {
  const navigate = useNavigate();
  const location = useLocation();
  const mode = location.pathname.startsWith("/listen") ? "listen" : "live";

  const toggle = () => {
    navigate(mode === "live" ? "/listen" : "/rooms");
  };

  return (
    <button
      onClick={toggle}
      title={mode === "live" ? "当前：看直播，点击切换到听视频" : "当前：听视频，点击切换到看直播"}
      className={cn(
        "flex h-7 shrink-0 items-center gap-2 rounded-full border p-0.5 transition-colors",
        mode === "live"
          ? "border-pink-500/50 bg-pink-500/10"
          : "border-black/10 bg-black/[0.04] dark:border-white/10 dark:bg-white/[0.06]"
      )}
    >
      {mode === "listen" && (
        <span className="pl-2 text-xs font-medium text-slate-600 dark:text-slate-300">听视频</span>
      )}
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full shadow-sm",
          mode === "live" ? "bg-pink-500 text-white" : "bg-white text-pink-500 dark:text-pink-400"
        )}
      >
        {mode === "live" ? <MonitorPlay className="h-3.5 w-3.5" /> : <Headphones className="h-3.5 w-3.5" />}
      </span>
      {mode === "live" && (
        <span className="pr-2 text-xs font-medium text-slate-600 dark:text-slate-300">看直播</span>
      )}
    </button>
  );
}
