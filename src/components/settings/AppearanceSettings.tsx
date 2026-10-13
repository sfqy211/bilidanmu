import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { BRAND_PRESETS } from "@/lib/brand-theme";
import { DEFAULT_VISUAL } from "@/lib/visual-defaults";
import { FONT_OPTIONS, isHexColor, resolveVisualProfile } from "@/lib/visual-theme";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { Settings, VisualFont, VisualProfile, VisualSetting } from "@/types/bilibili";
import { SettingsRow, type SettingsPanelProps } from "./SettingsControls";

type Mode = "light" | "dark";
const range = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, index) => min + index);
const UI_SIZES = range(12, 20);
const CONTENT_SIZES = range(12, 24);

function PillSelect({ label, value, options, onChange, disabled = false }: {
  label: string; value: string; options: readonly { value: string; label: string }[];
  onChange: (value: string) => void; disabled?: boolean;
}) {
  return <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} disabled={disabled}
    className="appearance-select">{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
}

function SizeSelect({ label, value, options, onChange }: {
  label: string; value: number; options: readonly number[]; onChange: (value: number) => void;
}) {
  const sizes = options.includes(value) ? options : [...options, value].sort((first, second) => first - second);
  return <select aria-label={label} value={String(value)} onChange={event => onChange(Number(event.target.value))} className="appearance-select">
    {sizes.map(size => <option key={size} value={size}>{size} px</option>)}
  </select>;
}

function ColorField({ label, value, onChange }: {
  label: string; value: string; onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value.toUpperCase());
  useEffect(() => setDraft(value.toUpperCase()), [value]);
  return <div className="appearance-color-field">
    <input type="color" aria-label={`${label}色盘`} value={value} onChange={event => onChange(event.target.value.toUpperCase())} />
    <input type="text" spellCheck={false} aria-label={`${label}色值`} maxLength={7} value={draft}
      aria-invalid={!isHexColor(draft)} onChange={event => setDraft(event.target.value)}
      onBlur={() => { if (isHexColor(draft)) onChange(draft.toUpperCase()); else setDraft(value.toUpperCase()); }}
      onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { event.preventDefault(); setDraft(value.toUpperCase()); } }} />
  </div>;
}

function Card({ children }: { children: ReactNode }) {
  return <div className="appearance-card">{children}</div>;
}

function ModePreview({ mode }: { mode: Settings["appearance"]["theme"] }) {
  const miniature = (variant: Mode) => <span className={`appearance-miniature appearance-miniature-${variant}`}>
    <span className="appearance-miniature-sidebar"><i /><i /><i /></span>
    <span className="appearance-miniature-page"><i /><i /><i /><i /><b /><i /></span>
  </span>;
  return <span className={`appearance-mode-preview appearance-mode-preview-${mode}`} aria-hidden="true">
    {mode === "system" ? <>{miniature("light")}{miniature("dark")}</> : miniature(mode)}
  </span>;
}

export function AppearanceSettings({ settings, patchSettings }: SettingsPanelProps) {
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const currentMode: Mode = settings.appearance.theme === "dark" || (settings.appearance.theme === "system" && systemDark) ? "dark" : "light";
  // 浅色与深色始终分别配置，未手动切换时跟随当前生效模式。
  const [editedMode, setEditedMode] = useState<Mode | null>(null);
  const mode = editedMode ?? currentMode;
  const updateVisual = (patch: Partial<VisualSetting>) => patchSettings({ visual: { ...settings.visual, ...patch } });
  const updateProfile = (patch: Partial<VisualProfile>) => {
    const visual = { ...settings.visual };
    visual[mode] = { ...resolveVisualProfile(settings, mode), ...patch };
    patchSettings({ visual });
  };
  const reset = () => patchSettings({ visual: structuredClone(DEFAULT_VISUAL) });
  const profile = resolveVisualProfile(settings, mode);
  const accentPreset = BRAND_PRESETS.find(preset => preset[mode].toUpperCase() === profile.accent.toUpperCase());
  return <div className="appearance-panel">
    <section aria-labelledby="appearance-style-title">
      <div className="appearance-section-heading">
        <h4 id="appearance-style-title">视觉风格</h4>
        <div className="appearance-segmented" role="group" aria-label="编辑明暗外观">
          {(["light", "dark"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value}
            onClick={() => setEditedMode(value)}>{value === "light" ? "浅色" : "深色"}</button>)}
        </div>
      </div>
      <Card><SettingsRow title="模式">
        <div className="appearance-modes" role="radiogroup" aria-label="颜色模式">
          {([{ value: "system", label: "跟随系统" }, { value: "light", label: "浅色模式" }, { value: "dark", label: "深色模式" }] as const).map(option => (
            <label key={option.value} className="appearance-mode-option" title={option.label}>
              <input type="radio" name="appearance-mode" aria-label={option.label} checked={settings.appearance.theme === option.value}
                onChange={() => { setEditedMode(null); patchSettings({ appearance: { ...settings.appearance, theme: option.value } }); }} />
              <ModePreview mode={option.value} />
            </label>
          ))}
        </div>
      </SettingsRow></Card>
      <Card>
        <SettingsRow title="强调色"><div className="appearance-inline-controls">
          <PillSelect label="强调色预设" value={accentPreset?.name ?? "custom"}
            options={[...BRAND_PRESETS.map(preset => ({ value: preset.name, label: preset.name.split(" ")[0] })),
              ...(accentPreset ? [] : [{ value: "custom", label: "自定义" }])]}
            onChange={value => { const preset = BRAND_PRESETS.find(item => item.name === value); if (preset) updateProfile({ accent: preset[mode] }); }} />
          <ColorField label="强调色" value={profile.accent} onChange={accent => updateProfile({ accent })} />
        </div></SettingsRow>
        <SettingsRow title="背景"><ColorField label="背景" value={profile.background} onChange={background => updateProfile({ background })} /></SettingsRow>
        <SettingsRow title="前景"><ColorField label="前景" value={profile.foreground} onChange={foreground => updateProfile({ foreground })} /></SettingsRow>
      </Card>
    </section>
    <AppearanceAdvanced settings={settings} mode={mode} onVisual={updateVisual} onProfile={updateProfile} onReset={reset} />
  </div>;
}

function AppearanceAdvanced({ settings, mode, onVisual, onProfile, onReset }: {
  settings: Settings; mode: Mode; onVisual: (patch: Partial<VisualSetting>) => void;
  onProfile: (patch: Partial<VisualProfile>) => void; onReset: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visual = settings.visual;
  const profile = resolveVisualProfile(settings, mode);
  return <section className="appearance-advanced">
    <div className="appearance-advanced-heading">
      <button type="button" aria-expanded={expanded} aria-controls="appearance-advanced-options" onClick={() => setExpanded(!expanded)}>
        高级<ChevronDown className={`h-3.5 w-3.5 ${expanded ? "" : "-rotate-90"}`} />
      </button>
      <button type="button" onClick={onReset}>重置为默认设置</button>
    </div>
    {expanded && <div id="appearance-advanced-options" className="appearance-advanced-options">
      <Card>
        <SettingsRow title="界面字体" description="调整导航、设置和控件使用的字体与字号。"><div className="appearance-inline-controls">
          <PillSelect label="界面字体" value={profile.fontFamily} options={FONT_OPTIONS}
            onChange={fontFamily => onProfile({ fontFamily: fontFamily as VisualFont })} />
          <SizeSelect label="界面字号" value={visual.uiFontSize} options={UI_SIZES} onChange={uiFontSize => onVisual({ uiFontSize })} />
        </div></SettingsRow>
        <SettingsRow title="内容字体" description="调整评论正文等阅读内容的字体与字号；弹幕和视频字幕使用各自的字号设置。"><div className="appearance-inline-controls">
          <PillSelect label="内容字体" value={profile.contentFontFamily} options={[{ value: "inherit", label: "与界面字体相同" }, ...FONT_OPTIONS]}
            onChange={contentFontFamily => onProfile({ contentFontFamily: contentFontFamily as VisualProfile["contentFontFamily"] })} />
          <SizeSelect label="内容字号" value={visual.contentFontSize} options={CONTENT_SIZES} onChange={contentFontSize => onVisual({ contentFontSize })} />
        </div></SettingsRow>
      </Card>
      <Card>
        <SettingsRow title="对比度" description="调整次要文字与背景的对比强度。">
          <label className="appearance-contrast">
            <input type="range" aria-label="对比度" value={visual.contrast} min={0} max={100} step={1}
              onChange={event => onVisual({ contrast: event.target.valueAsNumber })} />
            <span className="numeric">{visual.contrast}</span>
          </label>
        </SettingsRow>
      </Card>
    </div>}
  </section>;
}
