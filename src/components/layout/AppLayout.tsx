import { Outlet } from "react-router-dom";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TitleBar } from "@/components/layout/TitleBar";

export function AppLayout() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-[#0a0c14] dark:text-slate-100">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <AppSidebar />
        <main className="min-w-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
