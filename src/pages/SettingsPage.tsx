import { useEffect, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { HardDrive, Headphones, Info, MessageSquare, SlidersHorizontal, Volume2 } from "lucide-react";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";
import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { DanmakuSettings } from "@/components/settings/DanmakuSettings";
import { AudioSettings } from "@/components/settings/AudioSettings";
import { ListenSettings } from "@/components/settings/ListenSettings";
import { StorageSettings } from "@/components/settings/StorageSettings";
import { AboutSettings } from "@/components/settings/AboutSettings";
import { PageHeader } from "@/components/layout/PageHeader";

const SETTINGS_CATEGORIES = [
  { value: "general", label: "通用", description: "主题、颜色与窗口行为", icon: SlidersHorizontal, component: GeneralSettings },
  { value: "danmaku", label: "弹幕窗口", description: "文字、消息、活动栏与屏蔽", icon: MessageSquare, component: DanmakuSettings },
  { value: "audio", label: "直播音频", description: "直播音频与实时语音字幕", icon: Volume2, component: AudioSettings },
  { value: "listen", label: "听视频", description: "播放偏好、视频字幕与封面外观", icon: Headphones, component: ListenSettings },
  { value: "storage", label: "存储", description: "消息保留与图片缓存", icon: HardDrive, component: StorageSettings },
  { value: "about", label: "关于", description: "版本、更新与帮助", icon: Info, component: AboutSettings },
];

export function SettingsPage() {
  const settings = useSettingsStore((state) => state.settings);
  const setSettings = useSettingsStore((state) => state.setSettings);
  const patchSettings = useSettingsStore((state) => state.patchSettings);
  const [activeCategory, setActiveCategory] = useState("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    tauriCommands.settings.get()
      .then((loaded) => {
        if (cancelled) return;
        setSettings(loaded);
        setSaved(JSON.stringify(useSettingsStore.getState().settings));
      })
      .catch((reason) => { if (!cancelled) setLoadError(`加载设置失败：${String(reason)}`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [setSettings, reloadKey]);

  const dirty = saved !== null && JSON.stringify(settings) !== saved;
  const save = async () => {
    setSaving(true);
    setSaveError(null);
    const snapshot = useSettingsStore.getState().settings;
    try {
      await tauriCommands.settings.update(snapshot);
      setSaved(JSON.stringify(snapshot));
    } catch (reason) { setSaveError(`保存失败：${String(reason)}`); }
    finally { setSaving(false); }
  };

  return (
    <section className="settings-workspace flex h-full min-h-0 flex-col select-none">
      <PageHeader title="设置" actions={
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-muted" role="status">{loading ? "加载中…" : dirty ? "有未保存的更改" : saved !== null ? "设置已保存" : ""}</span>
          <button type="button" onClick={() => void save()} disabled={loading || saving || !!loadError || !dirty}
            className="inline-flex h-8 items-center rounded-md bg-brand px-3 text-[13px] font-medium text-brand-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? "保存中…" : "保存设置"}
          </button>
        </div>
      } />
      {saveError && <p className="mb-3 text-xs text-rose-600 dark:text-rose-300" role="alert">{saveError}</p>}
      <Tabs.Root value={activeCategory} onValueChange={setActiveCategory} orientation="vertical" className="settings-layout min-h-0 flex-1">
        <Tabs.List aria-label="设置分类" className="settings-navigation">
          {SETTINGS_CATEGORIES.map(({ value, label, icon: Icon }) => (
            <Tabs.Trigger key={value} value={value} className="settings-nav-item">
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.7} />{label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="settings-content min-h-0 overflow-y-auto">
          {SETTINGS_CATEGORIES.map(({ value, label, description, component: Panel }) => (
            <Tabs.Content key={value} value={value} className="outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
              <header className="mb-5">
                <h3 className="text-base font-semibold text-ink">{label}</h3>
                <p className="mt-1 text-xs text-ink-muted">{description}</p>
              </header>
              {value === "about" ? <AboutSettings /> : loading ? (
                <p className="text-[13px] text-ink-muted" role="status">正在加载设置…</p>
              ) : loadError ? (
                <div>
                  <p className="mb-3 text-xs text-rose-600 dark:text-rose-300" role="alert">{loadError}</p>
                  <button type="button" className="settings-action" onClick={() => setReloadKey((key) => key + 1)}>重新加载</button>
                </div>
              ) : (
                <fieldset disabled={saving} className="min-w-0 space-y-6">
                  <Panel settings={settings} patchSettings={patchSettings} />
                </fieldset>
              )}
            </Tabs.Content>
          ))}
        </div>
      </Tabs.Root>
      {dirty && <p className="mt-3 text-xs text-ink-muted">外观修改可即时预览，点击“保存设置”后下次启动仍会保留。</p>}
    </section>
  );
}
