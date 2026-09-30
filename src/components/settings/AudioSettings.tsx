import { useEffect, useState } from "react";
import { FolderOpen, RefreshCw } from "lucide-react";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";
import { SettingsChoice, SettingsGroup, SettingsRange, SettingsToggle, type SettingsPanelProps } from "./SettingsControls";

export function AudioSettings({ settings, patchSettings }: SettingsPanelProps) {
  return (
    <>
      <SettingsGroup title="直播音频">
        <SettingsRange title="默认音量" description="用于直播间音频；听视频播放器的音量单独记忆。" value={settings.audio.defaultVolume} min={0} max={100} unit="%"
          onChange={(defaultVolume) => patchSettings({ audio: { ...settings.audio, defaultVolume } })} />
        <SettingsToggle title="进入直播间时自动播放音频" checked={settings.audio.autoPlay}
          onChange={(autoPlay) => patchSettings({ audio: { ...settings.audio, autoPlay } })} />
      </SettingsGroup>
      <SpeechSettings settings={settings} patchSettings={patchSettings} />
    </>
  );
}

function SpeechSettings({ settings, patchSettings }: SettingsPanelProps) {
  const available = useSettingsStore((state) => state.sttAvailable);
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

  const modelFound = models.includes(settings.stt.modelId);
  const options = models.map((value) => ({ value, label: value }));
  if (settings.stt.modelId && !modelFound) options.unshift({ value: settings.stt.modelId, label: `${settings.stt.modelId}（未找到）` });
  const openDirectory = async () => {
    try { await tauriCommands.stt.openModelDir(); }
    catch (reason) { setError(`打开模型目录失败：${String(reason)}`); }
  };

  return (
    <SettingsGroup title="实时字幕" description="将直播音频转为字幕，需要先播放音频并安装本地识别模型。">
      <SettingsToggle title="启用语音识别" checked={settings.stt.enabled}
        disabled={!available || loading || (!modelFound && !settings.stt.enabled)}
        description={!available ? "语音识别当前不可用。" : !modelFound && !loading ? "请先安装并选择可用的识别模型。" : undefined}
        onChange={(enabled) => patchSettings({ stt: { ...settings.stt, enabled } })} />
      <SettingsChoice title="识别模型" value={settings.stt.modelId} options={options}
        disabled={!available || loading || models.length === 0} placeholder={loading ? "正在读取模型…" : "未检测到模型"}
        onChange={(modelId) => patchSettings({ stt: { ...settings.stt, modelId } })} />
      <SettingsRange title="字幕同步偏移" description="负值提前，正值延迟；0 表示不调整。" value={settings.stt.syncDelayMs} min={-2000} max={2000} step={100} unit="ms"
        disabled={!available} onChange={(syncDelayMs) => patchSettings({ stt: { ...settings.stt, syncDelayMs } })} />
      <div className="settings-row-block">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-ink">模型文件</p>
          <div className="flex gap-2">
            <button type="button" className="settings-action" disabled={!available || loading} onClick={() => setRefreshKey((key) => key + 1)}>
              <RefreshCw className="h-3.5 w-3.5" /> 刷新模型
            </button>
            <button type="button" className="settings-action" disabled={!available} onClick={() => void openDirectory()}>
              <FolderOpen className="h-3.5 w-3.5" /> 打开目录
            </button>
          </div>
        </div>
        {modelDir && <p title={modelDir} className="mt-2 break-all select-text text-xs text-ink-muted">{modelDir}</p>}
        {loading && <p className="mt-2 text-xs text-ink-muted" role="status">正在读取模型…</p>}
        {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-300" role="alert">{error}</p>}
        <details className="mt-2 text-xs leading-relaxed text-ink-muted">
          <summary className="cursor-pointer py-1">如何安装模型</summary>
          <p className="mt-1">将模型放入此目录，每个模型使用独立子文件夹，包含 encoder、decoder、joiner 的 ONNX 文件及 tokens.txt。放好后点击“刷新模型”，选择模型并保存设置。</p>
        </details>
      </div>
    </SettingsGroup>
  );
}
