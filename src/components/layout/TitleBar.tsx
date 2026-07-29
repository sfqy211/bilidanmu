import { useCallback, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize, Minus, X } from "lucide-react";
import { CloseDialog } from "@/components/ui/CloseDialog";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";
import appIcon from "@/icon.ico";

const appWindow = getCurrentWindow();

export function TitleBar() {
  const dblClickTimer = useRef(0);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const closeBehavior = useSettingsStore((s) => s.settings.closeBehavior);
  const patchSettings = useSettingsStore((s) => s.patchSettings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 忽略按钮区域的点击
    if ((e.target as HTMLElement).closest("button")) return;

    // 双击切换最大化
    const now = Date.now();
    if (now - dblClickTimer.current < 300) {
      void appWindow.toggleMaximize();
      dblClickTimer.current = 0;
      return;
    }
    dblClickTimer.current = now;

    // 左键拖拽
    if (e.button === 0) {
      void appWindow.startDragging();
    }
  }, []);

  const handleClose = useCallback(() => {
    if (closeBehavior === "exit") {
      void tauriCommands.app.quit();
    } else if (closeBehavior === "hide") {
      void appWindow.hide();
    } else {
      setShowCloseDialog(true);
    }
  }, [closeBehavior]);

  const handleDialogHide = useCallback(() => {
    setShowCloseDialog(false);
    void appWindow.hide();
  }, []);

  const handleDialogExit = useCallback(() => {
    setShowCloseDialog(false);
    void tauriCommands.app.quit();
  }, []);

  const handleDialogCancel = useCallback(() => {
    setShowCloseDialog(false);
  }, []);

  const handleRemember = useCallback((behavior: "hide" | "exit") => {
    patchSettings({ closeBehavior: behavior });
    void saveSettings();
  }, [patchSettings, saveSettings]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className="relative z-20 flex h-10 select-none items-center"
    >
      <div className="flex flex-1 items-center gap-2 px-4">
        <img src={appIcon} alt="" className="h-4 w-4" />
        <span className="text-xs font-medium tracking-wide text-slate-500 dark:text-slate-400">
          BiliDanmu
        </span>
      </div>
      <div className="flex h-full">
        <button
          type="button"
          onClick={() => appWindow.minimize()}
          className="flex h-full w-11 items-center justify-center text-slate-400 transition hover:bg-black/[0.05] dark:text-slate-500 dark:hover:bg-white/[0.06]"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => appWindow.toggleMaximize()}
          className="flex h-full w-11 items-center justify-center text-slate-400 transition hover:bg-black/[0.05] dark:text-slate-500 dark:hover:bg-white/[0.06]"
        >
          <Maximize className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-full w-11 items-center justify-center text-slate-400 transition hover:bg-rose-500 hover:text-white dark:text-slate-500 dark:hover:bg-rose-500"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <CloseDialog
        open={showCloseDialog}
        onHide={handleDialogHide}
        onExit={handleDialogExit}
        onCancel={handleDialogCancel}
        onRemember={handleRemember}
      />
    </div>
  );
}
