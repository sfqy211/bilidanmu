import { useEffect, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { HardDrive, Headphones, Info, Keyboard, MessageSquare, Palette, SlidersHorizontal, Volume2 } from "lucide-react";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";
import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { DanmakuSettings } from "@/components/settings/DanmakuSettings";
import { AudioSettings } from "@/components/settings/AudioSettings";
import { ListenSettings } from "@/components/settings/ListenSettings";
import { StorageSettings } from "@/components/settings/StorageSettings";
import { ShortcutsSettings } from "@/components/settings/ShortcutsSettings";
import { AboutSettings } from "@/components/settings/AboutSettings";
import { PageHeader } from "@/components/layout/PageHeader";

const SETTINGS_CATEGORIES = [
  { value: "general", label: "通用", description: "窗口行为与托盘", icon: SlidersHorizontal, component: GeneralSettings },
  { value: "shortcuts", label: "快捷键", description: "全局与应用内快捷键的自定义", icon: Keyboard, component: ShortcutsSettings },
  { value: "appearance", label: "外观", description: "", icon: Palette, component: AppearanceSettings },
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
  // 自动保存：改动停稳 600ms 后落盘，无需手动点击
  useEffect(() => {
    if (!dirty || loading || loadError) return;
    const timer = setTimeout(() => { void save(); }, 600);
    return () => clearTimeout(timer);
  });

  return (
    <section className="settings-workspace flex h-full min-h-0 flex-col select-none">
      <PageHeader title="设置" actions={
        <span className="text-xs text-ink-muted" role="status">
          {loading ? "加载中…" : saveError ? "自动保存失败，修改任意设置将重试" : saving ? "正在保存…" : dirty ? "即将自动保存…" : saved !== null ? "已自动保存" : ""}
        </span>
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
                <h3 className={`${value === "appearance" ? "appearance-title" : "text-base"} font-semibold text-ink`}>{label}</h3>
                {description && <p className="mt-1 text-xs text-ink-muted">{description}</p>}
              </header>
              {value === "about" ? <AboutSettings /> : loading ? (
                <p className="text-[13px] text-ink-muted" role="status">正在加载设置…</p>
              ) : loadError ? (
                <div>
                  <p className="mb-3 text-xs text-rose-600 dark:text-rose-300" role="alert">{loadError}</p>
                  <button type="button" className="settings-action" onClick={() => setReloadKey((key) => key + 1)}>重新加载</button>
                </div>
              ) : (
                <fieldset className="min-w-0 space-y-6">
                  <Panel settings={settings} patchSettings={patchSettings} />
                </fieldset>
              )}
            </Tabs.Content>
          ))}
        </div>
      </Tabs.Root>
    </section>
  );
}
