import type { ReactNode } from "react";
import { toast } from "sonner";
import { PanelCheck, PanelNote, PanelRow } from "@/components/ui/DanmakuPanel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { themePresets } from "@/lib/brand-theme";
import {
  FONT_OPTIONS,
  resolveCardColor,
  resolveVisualProfile,
} from "@/lib/visual-theme";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSettingsStore } from "@/stores/settings-store";
import type { Settings, VisualProfile } from "@/types/bilibili";

const TITLE_BUTTONS = [
  { key: "pin", label: "置顶" },
  { key: "lock", label: "锁定" },
  { key: "inputOnly", label: "仅输入框" },
  { key: "passthrough", label: "窗口透传" },
  { key: "stealth", label: "隐身" },
  { key: "close", label: "隐藏到托盘" },
  { key: "roomSwitcher", label: "房间切换" },
] as const;

function commitAppearance(patch: Partial<Settings["appearance"]>) {
  const { settings, patchSettings, saveSettings } = useSettingsStore.getState();
  patchSettings({ appearance: { ...settings.appearance, ...patch } });
  void saveSettings().catch((reason) =>
    toast.error(`保存外观设置失败。${String(reason)}`),
  );
}

function AppearanceSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <PanelRow label={label}>
      <div className="danmaku-window-select">
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger aria-label={label} disabled={disabled} />
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </PanelRow>
  );
}

function DanmakuWindowThemeSettings() {
  const settings = useSettingsStore((state) => state.settings);
  const override = useSettingsStore((state) => state.backgroundThemeOverride);
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const appearance = settings.appearance;
  const mode =
    override ??
    (appearance.theme === "system"
      ? systemDark
        ? "dark"
        : "light"
      : appearance.theme);
  const profile = resolveVisualProfile(settings, mode);
  const presets = themePresets(mode);
  const surface = resolveCardColor(
    profile.background,
    profile.foreground,
    mode === "dark",
    profile.card,
  );
  const preset = presets.find(
    (item) =>
      item.accent.toUpperCase() === profile.accent.toUpperCase() &&
      item.background.toUpperCase() === profile.background.toUpperCase() &&
      item.foreground.toUpperCase() === profile.foreground.toUpperCase() &&
      item.surface.toUpperCase() === surface.toUpperCase(),
  );
  const updateProfile = (patch: Partial<VisualProfile>) => {
    const {
      settings: current,
      patchSettings,
      saveSettings,
    } = useSettingsStore.getState();
    patchSettings({
      visual: {
        ...current.visual,
        [mode]: { ...current.visual[mode], ...patch },
      },
    });
    void saveSettings().catch((reason) =>
      toast.error(`保存主题设置失败。${String(reason)}`),
    );
  };
  const style = appearance.danmakuWindow;
  return (
    <>
      <AppearanceSelect
        label="主题"
        value={
          appearance.autoThemeFromBackground ? "background" : appearance.theme
        }
        disabled={appearance.autoThemeFromBackground}
        onChange={(theme) =>
          commitAppearance(
            theme === "background"
              ? { autoThemeFromBackground: true }
              : {
                  theme: theme as Settings["appearance"]["theme"],
                  autoThemeFromBackground: false,
                },
          )
        }
        options={[
          { value: "light", label: "浅色" },
          { value: "dark", label: "深色" },
          { value: "system", label: "跟随系统" },
          { value: "background", label: "跟随背景" },
        ]}
      />
      <PanelCheck
        label="跟随屏幕背景亮暗"
        checked={appearance.autoThemeFromBackground ?? false}
        onChange={(checked) => commitAppearance({ autoThemeFromBackground: checked })}
      />
      <AppearanceSelect
        label={`${mode === "dark" ? "深色" : "浅色"}主题预设`}
        value={preset?.id ?? "custom"}
        options={[
          ...presets.map((item) => ({ value: item.id, label: item.name })),
          { value: "custom", label: "自定义" },
        ]}
        onChange={(id) => {
          const next = presets.find((item) => item.id === id);
          if (next)
            updateProfile({
              accent: next.accent,
              background: next.background,
              card: next.surface,
              foreground: next.foreground,
            });
        }}
      />
      <AppearanceSelect
        label="强调色"
        value={style.accentMode}
        options={[
          { value: "follow", label: "跟随主题色" },
          { value: "custom", label: "独立强调色" },
        ]}
        onChange={(accentMode) =>
          commitAppearance({
            danmakuWindow: {
              ...style,
              accentMode: accentMode as typeof style.accentMode,
            },
          })
        }
      />
      {style.accentMode === "custom" && (
        <PanelRow label="自定义强调色">
          <input
            type="color"
            aria-label="自定义强调色"
            value={style.accentColor}
            onChange={(event) =>
              commitAppearance({
                danmakuWindow: { ...style, accentColor: event.target.value },
              })
            }
            className="h-7 w-10 cursor-pointer rounded-md border border-[var(--panel-border)] bg-transparent p-0.5"
          />
        </PanelRow>
      )}
      <AppearanceSelect
        label="界面字体"
        value={profile.fontFamily}
        options={FONT_OPTIONS}
        onChange={(fontFamily) =>
          updateProfile({
            fontFamily: fontFamily as VisualProfile["fontFamily"],
          })
        }
      />
      <AppearanceSelect
        label="内容字体"
        value={profile.contentFontFamily}
        options={[
          { value: "inherit", label: "与界面字体相同" },
          ...FONT_OPTIONS,
        ]}
        onChange={(contentFontFamily) =>
          updateProfile({
            contentFontFamily:
              contentFontFamily as VisualProfile["contentFontFamily"],
          })
        }
      />
    </>
  );
}

function DanmakuWindowTitleButtons({
  switcherLabel,
}: {
  switcherLabel: string;
}) {
  const buttons = useSettingsStore(
    (state) => state.settings.appearance.titleBarButtons,
  );
  return (
    <details className="danmaku-window-appearance-details">
      <summary>标题栏按钮</summary>
      <div className="danmaku-window-title-options">
        {TITLE_BUTTONS.map(({ key, label }) => (
          <button
            type="button"
            key={key}
            aria-label={`${key === "roomSwitcher" ? switcherLabel : label}按钮`}
            aria-pressed={buttons[key]}
            onClick={() =>
              commitAppearance({
                titleBarButtons: { ...buttons, [key]: !buttons[key] },
              })
            }
          >
            {key === "roomSwitcher" ? switcherLabel : label}
          </button>
        ))}
      </div>
    </details>
  );
}

export function DanmakuWindowAppearanceSettings({
  children,
  switcherLabel = "房间切换",
}: {
  children?: ReactNode;
  switcherLabel?: string;
}) {
  return (
    <div className="danmaku-window-appearance">
      <DanmakuWindowThemeSettings />
      {children}
      <DanmakuWindowTitleButtons switcherLabel={switcherLabel} />
      <PanelNote>主题、字体、强调色和标题栏按钮使用全局外观设置。</PanelNote>
    </div>
  );
}
