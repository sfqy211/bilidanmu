import { Outlet } from "react-router-dom";
import { Eye } from "lucide-react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TitleBar } from "@/components/layout/TitleBar";
import { useAuthStore } from "@/stores/auth-store";

export function AppLayout() {
  const isAnonymous = useAuthStore((state) => state.isAnonymous);

  return (
    <div className="window-rounded app-atmosphere app-scope flex h-full flex-col overflow-hidden text-slate-900 dark:text-slate-100">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <AppSidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-auto">
          {/* 匿名模式横幅 */}
          {isAnonymous && (
            <div className="glass-panel m-4 mb-0 flex items-center gap-2 rounded-xl px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
              <Eye className="h-3.5 w-3.5 shrink-0" />
              <span>匿名模式：仅可接收弹幕和音频流，无法发送弹幕、点赞或使用表情。</span>
            </div>
          )}
          <div className="flex-1 px-8 pb-8 pt-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
