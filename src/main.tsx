import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { router } from "@/router";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import { queryClient } from "@/lib/query-client";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";
import { useRoomStore } from "@/stores/room-store";
import "./index.css";

async function bootstrap() {
  try {
    const settings = await tauriCommands.settings.get();
    useSettingsStore.getState().setSettings(settings);
    applyTheme(settings.appearance.theme);
  } catch {
    applyTheme(getStoredTheme() ?? "system");
  }

  // 在首帧渲染前恢复视图模式，避免 card→list 闪烁
  try {
    const selections = await tauriCommands.selections.load(["roomViewMode"]);
    if (selections.roomViewMode === "card" || selections.roomViewMode === "list") {
      useRoomStore.getState().setViewMode(selections.roomViewMode);
    }
  } catch {
    // 忽略读取失败，使用默认值
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
