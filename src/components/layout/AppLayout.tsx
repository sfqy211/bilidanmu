import { Outlet } from "react-router-dom";
import { Eye } from "lucide-react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TitleBar } from "@/components/layout/TitleBar";
import { DockCollapsedBar } from "@/components/DockCollapsedBar";
import { useAuthStore } from "@/stores/auth-store";
import { useWindowDock } from "@/hooks/useWindowDock";

export function AppLayout() {
  const isAnonymous = useAuthStore((state) => state.isAnonymous);
  const { phase, side, expand } = useWindowDock();

  // 侧边吸附的收缩态：只渲染细条
  if (phase === "collapsed") {
    return <DockCollapsedBar side={side} onExpand={expand} />;
  }

  return (
    <div
      className="window-rounded flex h-full flex-col overflow-hidden bg-[#f5f5f5] text-slate-900 dark:bg-[#0a0c14] dark:text-slate-100"
    >
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <AppSidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-auto">
          {/* 匿名模式横幅 */}
          {isAnonymous && (
            <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              <Eye className="h-3.5 w-3.5 shrink-0" />
              <span>匿名模式：仅可接收弹幕和音频流，无法发送弹幕、点赞或使用表情。</span>
            </div>
          )}
          <div className="flex-1 p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
