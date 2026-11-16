import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";
import { SttModelManagerPage } from "./SttModelManagerPage";
import { SettingsGroup, SettingsRange, SettingsToggle, type SettingsPanelProps } from "./SettingsControls";

export function AudioSettings({ settings, patchSettings }: SettingsPanelProps) {
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
      <SettingsGroup title="弹幕小窗音频">
        <SettingsRange title="全局音量" description="弹幕与听视频共用的音量，任一处（弹幕窗/播放器/此设置）调节都会即时联动。"
          value={settings.audio.defaultVolume} min={0} max={100} unit="%"
          onChange={(defaultVolume) => {
            patchSettings({ audio: { ...settings.audio, defaultVolume } });
            void useSettingsStore.getState().saveSettings();
          }} />
        <SettingsToggle title="进入弹幕小窗时自动播放音频"
          description="直播弹幕窗进入时自动连接直播音频；视频播放页与视频弹幕窗进入时自动播放视频音频。关闭时停在暂停态，需手动播放。"
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
      .catch((reason) => { if (!cancelled) setError(`读取模型失败：${String(reason)}`); })
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
  const available = useSettingsStore((state) => state.sttAvailable);
  const { models, loading } = sttModels;
  const modelFound = models.includes(settings.stt.modelId);

  // 当前模型的完整名称：主页面不再用下拉框（190px 控制列放不下长模型名），
  // 完整名称放在左侧说明区 break-all 展示，切换入口进二级管理页
  const currentModelLabel = loading
    ? "正在读取模型…"
    : settings.stt.modelId
      ? `${settings.stt.modelId}${modelFound ? "" : "（未找到）"}`
      : "未检测到模型";

  return (
    <SettingsGroup title="实时字幕" description="将直播音频转为字幕，需要先播放音频并安装本地识别模型。">
      <SettingsToggle title="启用语音识别" checked={settings.stt.enabled}
        disabled={!available || loading || (!modelFound && !settings.stt.enabled)}
        description={!available ? "语音识别当前不可用。" : !modelFound && !loading ? "请先安装并选择可用的识别模型。" : undefined}
        onChange={(enabled) => patchSettings({ stt: { ...settings.stt, enabled } })} />
      <div className="settings-row">
        <div className="min-w-0">
          <p className="text-[13px] text-ink">识别模型</p>
          <p className="mt-1 break-all text-xs text-ink-muted" role="status">{currentModelLabel}</p>
        </div>
        <div className="settings-row-control">
          <button type="button" className="settings-action" disabled={!available || loading} onClick={onOpenModelPage}>
            管理模型 <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <SettingsRange title="字幕同步偏移" description="字幕已按播放进度自动对齐，一般无需调整；仅在实测仍有固定偏移时微调（负值提前，正值延迟）。" value={settings.stt.syncDelayMs} min={-2000} max={2000} step={100} unit="ms"
        disabled={!available} onChange={(syncDelayMs) => patchSettings({ stt: { ...settings.stt, syncDelayMs } })} />
    </SettingsGroup>
  );
}
