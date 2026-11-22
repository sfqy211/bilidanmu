import { useTranslation as useDesktopTranslation, i18n as desktopI18n } from "@/i18n";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";
import { SttModelManagerPage } from "./SttModelManagerPage";
import { SettingsGroup, SettingsRange, SettingsToggle, type SettingsPanelProps } from "./SettingsControls";

export function AudioSettings({ settings, patchSettings }: SettingsPanelProps) {
  const { t: translate } = useDesktopTranslation("desktop");
  // 「识别模型管理」二级页面：模型名较长，收在 190px 宽的下拉框里完全看不清选了什么；
  // 切换/下载/刷新/打开目录统一收进独立页面，按友好名称 + 大小完整展示
  const [modelPage, setModelPage] = useState(false);
  const available = useSettingsStore((state) => state.sttAvailable);
  const sttModels = useSttModels(available);

  if (modelPage) {
    return (
      <SttModelManagerPage
        settings={settings}
        patchSettings={patchSettings}
        sttModels={sttModels}
        onBack={() => setModelPage(false)}
      />
    );
  }

  return (
    <>
      <SettingsGroup title={translate("audioSettings.audio")}>
        <SettingsRange title={translate("audioSettings.volume")} description={translate("audioSettings.volumeHint")}
          value={settings.audio.defaultVolume} min={0} max={100} unit="%"
          onChange={(defaultVolume) => {
            patchSettings({ audio: { ...settings.audio, defaultVolume } });
            void useSettingsStore.getState().saveSettings();
          }} />
        <SettingsToggle title={translate("audioSettings.autoplay")}
          description={translate("audioSettings.autoplayHint")}
          checked={settings.audio.autoPlay}
          onChange={(autoPlay) => patchSettings({ audio: { ...settings.audio, autoPlay } })} />
      </SettingsGroup>
      <SpeechSettings settings={settings} patchSettings={patchSettings} sttModels={sttModels}
        onOpenModelPage={() => setModelPage(true)} />
    </>
  );
}

/** 拉取模型目录与已安装模型清单（主页面与二级管理页共用） */
function useSttModels(available: boolean) {
  const [modelDir, setModelDir] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!available) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([tauriCommands.stt.getModelDir(), tauriCommands.stt.listModels()])
      .then(([dir, ids]) => { if (!cancelled) { setModelDir(dir); setModels(ids); } })
      .catch((reason) => { if (!cancelled) setError(desktopI18n.t("desktop:audioSettings.modelsFailed", { value: String(reason) })); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [available, refreshKey]);

  return {
    modelDir,
    models,
    loading,
    error,
    setError,
    /** 重新扫描模型目录（下载完成/手动刷新共用） */
    refresh: () => { setError(null); setRefreshKey((key) => key + 1); },
  };
}

export type SttModelsState = ReturnType<typeof useSttModels>;

function SpeechSettings({ settings, patchSettings, sttModels, onOpenModelPage }: SettingsPanelProps & {
  sttModels: SttModelsState;
  onOpenModelPage: () => void;
}) {
  const { t: translate } = useDesktopTranslation("desktop");
  const available = useSettingsStore((state) => state.sttAvailable);
  const { models, loading } = sttModels;
  const modelFound = models.includes(settings.stt.modelId);

  // 当前模型的完整名称：主页面不再用下拉框（190px 控制列放不下长模型名），
  // 完整名称放在左侧说明区 break-all 展示，切换入口进二级管理页
  const currentModelLabel = loading
    ? translate("audioSettings.loadingModels")
    : settings.stt.modelId
      ? modelFound ? settings.stt.modelId : translate("audioSettings.missingModel", { model: settings.stt.modelId })
      : translate("audioSettings.noModels");

  return (
    <SettingsGroup title={translate("audioSettings.captions")} description={translate("audioSettings.captionsHint")}>
      <SettingsToggle title={translate("audioSettings.enable")} checked={settings.stt.enabled}
        disabled={!available || loading || (!modelFound && !settings.stt.enabled)}
        description={!available ? translate("audioSettings.unavailable") : !modelFound && !loading ? translate("audioSettings.install") : undefined}
        onChange={(enabled) => patchSettings({ stt: { ...settings.stt, enabled } })} />
      <div className="settings-row">
        <div className="min-w-0">
          <p className="text-[13px] text-ink">{translate("audioSettings.model")}</p>
          <p className="mt-1 break-all text-xs text-ink-muted" role="status">{currentModelLabel}</p>
        </div>
        <div className="settings-row-control">
          <button type="button" className="settings-action" disabled={!available || loading} onClick={onOpenModelPage}>
            {translate("audioSettings.manage") + " "}<ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <SettingsRange title={translate("audioSettings.offset")} description={translate("audioSettings.offsetHint")} value={settings.stt.syncDelayMs} min={-2000} max={2000} step={100} unit="ms"
        disabled={!available} onChange={(syncDelayMs) => patchSettings({ stt: { ...settings.stt, syncDelayMs } })} />
    </SettingsGroup>
  );
}
