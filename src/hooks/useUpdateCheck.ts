import { useCallback, useEffect, useState } from "react";
import { tauriCommands } from "@/lib/tauri";
import type { UpdateInfo } from "@/types/bilibili";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 小时
const LAST_CHECK_KEY = "lastUpdateCheck";

function shouldAutoCheck(): boolean {
  try {
    const last = localStorage.getItem(LAST_CHECK_KEY);
    if (!last) return true;
    return Date.now() - Number(last) > CHECK_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markChecked() {
  try {
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export function useUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const checkForUpdate = useCallback(async (silent = true) => {
    setChecking(true);
    try {
      const info = await tauriCommands.update.check();
      markChecked();
      if (info.hasUpdate) {
        setUpdateInfo(info);
        setDismissed(false);
      }
    } catch (e) {
      if (!silent) {
        throw e;
      }
    } finally {
      setChecking(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setUpdateInfo(null);
  }, []);

  // 启动时自动检查（每天最多一次）
  useEffect(() => {
    if (shouldAutoCheck()) {
      void checkForUpdate(true);
    }
  }, [checkForUpdate]);

  return {
    updateInfo: dismissed ? null : updateInfo,
    checking,
    checkForUpdate,
    dismiss,
  };
}
