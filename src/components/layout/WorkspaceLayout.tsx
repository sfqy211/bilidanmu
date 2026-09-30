import { Outlet } from "react-router-dom";
import type { ReactNode } from "react";
import { TitleBar } from "./TitleBar";
import { MiniPlayer } from "@/components/listen/MiniPlayer";

export function WorkspaceLayout({ sidebar, notice }: { sidebar: ReactNode; notice?: ReactNode }) {
  return (
    <div className="window-rounded app-atmosphere app-scope workspace-shell flex h-full flex-col overflow-hidden text-ink">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        {sidebar}
        <main className="workspace-main flex min-h-0 min-w-0 flex-1 flex-col">
          {notice}
          <div className="workspace-page min-h-0 flex-1 overflow-auto"><Outlet /></div>
          <MiniPlayer />
        </main>
      </div>
    </div>
  );
}
