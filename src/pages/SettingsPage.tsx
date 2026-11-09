import { useEffect, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { HardDrive, Headphones, Info, Keyboard, MessageSquare, Palette, Share2, SlidersHorizontal, Volume2 } from "lucide-react";
import { tauriCommands } from "@/lib/tauri";
import { defaultSettings, useSettingsStore } from "@/stores/settings-store";
import type { Settings } from "@/types/bilibili";
import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { DanmakuSettings } from "@/components/settings/DanmakuSettings";
import { AudioSettings } from "@/components/settings/AudioSettings";
import { ListenSettings } from "@/components/settings/ListenSettings";
import { StorageSettings } from "@/components/settings/StorageSettings";
import { ShortcutsSettings } from "@/components/settings/ShortcutsSettings";
import { AboutSettings } from "@/components/settings/AboutSettings";
import { PageHeader } from "@/components/layout/PageHeader";
import { IngestSettings } from "@/components/settings/IngestSettings";

const SETTINGS_CATEGORIES = [
  // resetKeys：本页「重置为默认设置」会还原的顶层字段，只影响本页
  { value: "general", label: "通用", description: "窗口行为与托盘", icon: SlidersHorizontal, component: GeneralSettings,
    resetKeys: ["closeBehavior", "silentStart", "showAvatars"] },
  { value: "shortcuts", label: "快捷键", description: "全局与应用内快捷键的自定义", icon: Keyboard, component: ShortcutsSettings,
    resetKeys: ["shortcuts"] },
  { value: "appearance", label: "外观", description: "", icon: Palette, component: AppearanceSettings,
    resetKeys: ["visual", "appearance"] },
  { value: "danmaku", label: "弹幕窗口", description: "文字、消息、活动栏与屏蔽", icon: MessageSquare, component: DanmakuSettings,
    resetKeys: ["appearance", "filter"] },  { value: "audio", label: "直播音频", description: "直播音频与实时语音字幕", icon: Volume2, component: AudioSettings,
    resetKeys: ["audio", "stt"] },
  { value: "listen", label: "听视频", description: "播放偏好、视频字幕与封面外观", icon: Headphones, component: ListenSettings,
    resetKeys: ["listen"] },
  { value: "storage", label: "存储", description: "消息保留与图片缓存", icon: HardDrive, component: StorageSettings,
    resetKeys: ["cache"] },
  { value: "ingest", label: "共享上报", description: "把弹幕推送到中心归档服务", icon: Share2, component: IngestSettings,
    resetKeys: ["ingest"] },
  { value: "about", label: "关于", description: "版本、更新与帮助", icon: Info, component: AboutSettings,
    resetKeys: [] },
] satisfies Array<{
  value: string; label: string; description: string; icon: typeof SlidersHorizontal;
  component: typeof GeneralSettings; resetKeys: (keyof Settings)[];
}>;

/** 外观页之外的分类只重置 appearance 的部分字段，避免误伤配色等外观设置 */
const APPEARANCE_SUBSET: Partial<Record<string, (keyof Settings["appearance"])[]>> = {
  danmaku: [
    "fontSize", "showMedal", "showLevel", "hideGloryLevel", "hideFanMedal", "hideAdminBadge",
    "hideUserIdColor", "hideUsername", "hideContributionRank", "opacity", "emoticonStyle",
    "activityBarMode", "activityFilter", "scInDanmaku", "dockAnimMs", "danmakuWindow", "titleBarButtons",
  ],
};

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

  /**
   * 重置某一页的设置为默认值。
   * 只覆盖该页涉及的顶层字段——例如在「弹幕窗口」页重置不会清掉配色，
   * 在「通用」页重置不影响快捷键与音频。
   * 外观字段有子集划分：弹幕窗口页只重置弹幕相关项，不碰主题与配色。
   */
  const resetCategory = (keys: (keyof Settings)[]) => {
    const patch: Partial<Settings> = {};
    for (const key of keys) {
      if (key === "appearance" && APPEARANCE_SUBSET[activeCategory]) {
        // 合并而不是整体替换：只还原本页涉及的子字段
        const subset = APPEARANCE_SUBSET[activeCategory]!;
        const next = { ...settings.appearance };
        for (const field of subset) {
          (next as Record<string, unknown>)[field] = defaultSettings.appearance[field];
        }
        (patch as Record<string, unknown>).appearance = next;
        continue;
      }
      // 深拷贝默认值，避免与 defaultSettings 共享引用
      (patch as Record<string, unknown>)[key] = structuredClone(defaultSettings[key]);
    }
    patchSettings(patch);
  };

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
      {/* 分类竖排在左，与应用主侧栏的方向一致（横排会破坏一致性，
          且分类项后续增加时容易杂乱）；内容区在右侧居中显示 */}
      <Tabs.Root value={activeCategory} onValueChange={setActiveCategory} orientation="vertical" className="settings-layout min-h-0 flex-1">
        <Tabs.List aria-label="设置分类" className="settings-navigation">
          {SETTINGS_CATEGORIES.map(({ value, label, icon: Icon }) => (
            <Tabs.Trigger key={value} value={value} className="settings-nav-item">
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.7} />{label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="settings-content min-h-0 overflow-y-auto">
          {SETTINGS_CATEGORIES.map(({ value, label, description, component: Panel, resetKeys }) => (
            <Tabs.Content key={value} value={value} className="outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
              <header className="mb-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">{label}</h3>
                  {description && <p className="mt-1 text-xs text-ink-muted">{description}</p>}
                </div>
                {/* 只重置本页涉及的字段，不影响其他页面配置 */}
                {resetKeys.length > 0 && !loading && !loadError && (
                  <button type="button" className="appearance-reset shrink-0" onClick={() => resetCategory(resetKeys)}>
                    重置为默认设置
                  </button>
                )}
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
