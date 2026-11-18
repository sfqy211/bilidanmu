import { useEffect, useState } from "react";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * 当前设置的 STT 模型是否已安装。
 *
 * `enabled` 为 false 时不扫描目录；返回 null 表示正在检查，
 * 调用方据此区分「检查中 / 未安装 / 已安装」。
 */
export function useSttModelReady(enabled: boolean) {
  const modelId = useSettingsStore((state) => state.settings.stt.modelId);
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) {
      setReady(null);
      return;
    }
    let cancelled = false;
    tauriCommands.stt
      .listModels()
      .then((models) => {
        if (!cancelled) setReady(models.includes(modelId));
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, modelId]);

  return ready;
}
