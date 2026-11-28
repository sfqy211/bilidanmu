import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { initializeLocale } from "@/i18n/locale-sync";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import { applyVisualTheme } from "@/lib/visual-theme";
import { applyMotionPreference } from "@/lib/motion";
import { queryClient } from "@/lib/query-client";
import { tauriCommands } from "@/lib/tauri";
import { initVideoViewMode } from "@/lib/video-view-preference";
import { useSettingsStore } from "@/stores/settings-store";
import { useRoomStore } from "@/stores/room-store";
import { clampSidebarWidth, useUiStore } from "@/stores/ui-store";
import "./index.css";
import "@danmaku-core/ui/styles.css";

async function bootstrap() {
  if (window.location.pathname === "/danmaku-input-overlay") {
    document.documentElement.dataset.transparent = "true";
    const session = window.__BILIDANMU_FULLSCREEN_INPUT__;
    if (session) {
      const { FullscreenDanmakuInputPage } = await import("@/pages/FullscreenDanmakuInputPage");
      ReactDOM.createRoot(document.getElementById("root")!).render(<FullscreenDanmakuInputPage session={session} />);
    }
    return;
  }

  const [{ router }, settings] = await Promise.all([import("@/router"), initializeLocale()]);
  if (settings) {
    useSettingsStore.getState().setSettings(settings);
    applyVisualTheme(useSettingsStore.getState().settings);
    // 其他窗口改了「动效」等外观设置时即时同步，不必重载整个主题
    useSettingsStore.subscribe((state) => applyMotionPreference(state.settings.appearance.motion));
  } else {
    applyTheme(getStoredTheme() ?? "system");
  }

  // 在首帧渲染前恢复视图模式，避免 card→list 闪烁
  try {
    const selections = await tauriCommands.selections.load([
      "roomViewMode",
      "sidebarWidth",
      "sidebarCollapsed",
      "videoViewMode",
    ]);
    if (selections.roomViewMode === "card" || selections.roomViewMode === "list") {
      useRoomStore.getState().setViewMode(selections.roomViewMode);
    }
    if (typeof selections.sidebarWidth === "number") {
      useUiStore.getState().setSidebarWidth(clampSidebarWidth(selections.sidebarWidth));
    }
    if (typeof selections.sidebarCollapsed === "boolean") {
      useUiStore.getState().setSidebarCollapsed(selections.sidebarCollapsed);
    }
    initVideoViewMode(selections.videoViewMode);
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
