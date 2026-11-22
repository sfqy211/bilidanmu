import { useTranslation as useDesktopTranslation, i18n as desktopI18n } from "@/i18n";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { tauriCommands } from "@/lib/tauri";
import { SettingsGroup, SettingsRow, type SettingsPanelProps } from "./SettingsControls";

interface CacheStats {
  imageSize: number; imageCount: number; emoticonPkgCount: number; emoticonCount: number; emoticonImageSize: number;
}
type ClearTarget = "image" | "emoticon" | "all";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StorageSettings({ settings, patchSettings }: SettingsPanelProps) {
  const { t: translate } = useDesktopTranslation("desktop");
  return (
    <>
      <SettingsGroup title={translate("storage.messages")} description={translate("storage.messagesHint")}>
        <SettingsRow title={translate("storage.limit")} description={translate("storage.limitHint")}>
          <input type="number" aria-label={translate("storage.limit")} min={0} step={50} value={settings.cache.messageLimit}
            onChange={(event) => {
              const value = event.target.valueAsNumber;
              if (Number.isFinite(value)) patchSettings({ cache: { messageLimit: Math.max(0, Math.floor(value)) } });
            }} className="h-8 w-full px-3 text-[13px]" />
        </SettingsRow>
      </SettingsGroup>
      <ImageCacheSettings />
    </>
  );
}

function ImageCacheSettings() {
  const { t: translate } = useDesktopTranslation("desktop");
  const clearDetails = {
    image: { title: translate("storage.clearCovers"), message: translate("storage.clearCoversHint") },
    emoticon: { title: translate("storage.clearEmotes"), message: translate("storage.clearEmotesHint") },
    all: { title: translate("storage.clearImages"), message: translate("storage.clearImagesHint") },
  };
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [target, setTarget] = useState<ClearTarget | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    tauriCommands.proxy.getCacheStats()
      .then((value) => { if (!cancelled) setStats(value); })
      .catch((reason) => { if (!cancelled) setError(desktopI18n.t("desktop:storage.readFailed", { value: String(reason) })); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const refresh = () => { setError(null); setRefreshKey((key) => key + 1); };
  const clear = async (next: ClearTarget) => {
    setTarget(null);
    setClearing(true);
    setMessage(null);
    setError(null);
    const operations = [];
    if (next !== "emoticon") operations.push(tauriCommands.proxy.clearImageCache());
    if (next !== "image") operations.push(tauriCommands.room.clearEmoticonCache());
    const results = await Promise.allSettled(operations);
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length) setError(failures.length === results.length ? translate("storage.clearFailed") : translate("storage.partialFailure"));
    else setMessage(translate("storage.cleared"));
    setClearing(false);
    setRefreshKey((key) => key + 1);
  };
  return (
    <SettingsGroup title={translate("storage.imageCache")} description={translate("storage.imageHint")}>
      <div className="settings-row">
        <span className="text-xs text-ink-muted" role="status">{loading ? translate("storage.loading") : clearing ? translate("storage.clearing") : message || translate("storage.size")}</span>
        <button type="button" className="settings-action" disabled={loading || clearing} onClick={refresh}>{translate("storage.refresh")}</button>
      </div>
      <SettingsRow title={translate("storage.covers")} description={stats ? translate("storage.imageCount", { value: stats.imageCount, value2: formatSize(stats.imageSize) }) : translate("storage.unread")}>
        <button type="button" className="settings-action" disabled={clearing || !stats} onClick={() => setTarget("image")}>{translate("storage.clear")}</button>
      </SettingsRow>
      <SettingsRow title={translate("storage.emotes")} description={stats ? translate("storage.emoteCount", { value: stats.emoticonPkgCount, value2: stats.emoticonCount, value3: formatSize(stats.emoticonImageSize) }) : translate("storage.unread")}>
        <button type="button" className="settings-action" disabled={clearing || !stats} onClick={() => setTarget("emoticon")}>{translate("storage.clear")}</button>
      </SettingsRow>
      <SettingsRow title={translate("storage.clearImages")}>
        <button type="button" className="settings-action text-rose-600 dark:text-rose-300" disabled={clearing || !stats} onClick={() => setTarget("all")}>{translate("storage.clearAll")}</button>
      </SettingsRow>
      {error && <p className="settings-row-block text-xs text-rose-600 dark:text-rose-300" role="alert">{error}</p>}
      <ConfirmDialog open={target !== null} title={target ? clearDetails[target].title : translate("storage.clearCache")}
        message={target ? clearDetails[target].message : ""} variant="danger"
        onConfirm={() => { if (target) void clear(target); }} onCancel={() => setTarget(null)} />
    </SettingsGroup>
  );
}
