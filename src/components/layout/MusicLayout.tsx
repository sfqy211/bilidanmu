import { Outlet } from "react-router-dom";
import { TitleBar } from "@/components/layout/TitleBar";
import { MusicSidebar } from "@/components/layout/MusicSidebar";
import { MiniPlayer } from "@/components/listen/MiniPlayer";

/** 音乐模式外壳：与直播外壳完全独立的侧栏与内容区，仅标题栏（窗口控制）共用 */
export function MusicLayout() {
  return (
    <div className="window-rounded app-atmosphere app-scope flex h-full flex-col overflow-hidden text-slate-900 dark:text-slate-100">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <MusicSidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-auto">
          <div className="min-h-0 flex-1 px-8 pb-8 pt-6">
            <Outlet />
          </div>
          <MiniPlayer />
        </main>
      </div>
    </div>
  );
}
