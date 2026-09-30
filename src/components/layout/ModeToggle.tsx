import { useNavigate } from "react-router-dom";
import { Headphones, MonitorPlay } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceMode } from "@/hooks/useWorkspaceMode";

/**
 * 全局模式切换（软件左上角标题栏内）：看直播 / 听视频。
 * 标题栏与滑块在切换时保持挂载；只替换工作区中的页面，让滑块连续移动。
 */
export function ModeToggle() {
  const navigate = useNavigate();
  const mode = useWorkspaceMode();

  const toggle = () => {
    navigate(mode === "live" ? "/listen" : "/rooms");
  };

  return (
    <button
      onClick={toggle}
      title={mode === "live" ? "当前：看直播，点击切换到听视频" : "当前：听视频，点击切换到看直播"}
      type="button"
      aria-label={mode === "live" ? "看直播，切换到听视频" : "听视频，切换到看直播"}
      data-mode={mode}
      className={cn(
        "workspace-mode-toggle relative h-7 w-[82px] shrink-0 rounded-full border transition-colors",
        mode === "live"
          ? "border-brand/50 bg-brand/10"
          : "border-black/10 bg-black/[0.04] dark:border-white/10 dark:bg-white/[0.06]"
      )}
    >
      <span aria-hidden="true" className="workspace-mode-label workspace-mode-label-live text-xs font-medium text-slate-600 dark:text-slate-300">看直播</span>
      <span aria-hidden="true" className="workspace-mode-label workspace-mode-label-listen text-xs font-medium text-slate-600 dark:text-slate-300">听视频</span>
      <span className={cn(
        "workspace-mode-knob absolute left-0.5 top-px z-10 flex h-6 w-6 items-center justify-center rounded-full shadow-sm",
        mode === "live" ? "bg-brand text-brand-contrast" : "bg-white text-brand dark:text-brand"
      )}>
        {mode === "live" ? <MonitorPlay className="h-3.5 w-3.5" /> : <Headphones className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}
