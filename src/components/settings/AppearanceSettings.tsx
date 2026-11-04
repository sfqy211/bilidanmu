import { useEffect, useState, type ReactNode } from "react";
import { themePresets } from "@/lib/brand-theme";
import { FONT_OPTIONS, isHexColor, resolveCardColor, resolveVisualProfile } from "@/lib/visual-theme";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { Settings, VisualFont, VisualProfile, VisualSetting } from "@/types/bilibili";
import { SettingsRow, type SettingsPanelProps } from "./SettingsControls";

type Mode = "light" | "dark";
const range = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, index) => min + index);
const UI_SIZES = range(12, 20);
const CONTENT_SIZES = range(12, 24);

/** 自绘下拉：原生 <select> 的展开列表由系统绘制，无法跟随暗色主题，
 *  这里改用项目内的 Select 组件（自绘弹层，支持键盘导航） */
function PillSelect({ label, value, options, onChange, disabled = false }: {
  label: string; value: string; options: readonly { value: string; label: string }[];
  onChange: (value: string) => void; disabled?: boolean;
}) {
  return <div className="appearance-select-wrap">
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className="appearance-select-trigger" disabled={disabled} />
      <SelectContent>
        {options.map(option => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>;
}

function SizeSelect({ label, value, options, onChange }: {
  label: string; value: number; options: readonly number[]; onChange: (value: number) => void;
}) {
  const sizes = options.includes(value) ? options : [...options, value].sort((first, second) => first - second);
  return <div className="appearance-select-wrap">
    <Select value={String(value)} onValueChange={next => onChange(Number(next))}>
      <SelectTrigger aria-label={label} className="appearance-select-trigger" />
      <SelectContent>
        {sizes.map(size => <SelectItem key={size} value={String(size)}>{size} px</SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
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
  // 配色始终作用于"当前实际生效的主题"：想改浅色就切到浅色模式再改。
  // 此前还有一个"不切主题也能预览另一模式"的切换钮，已移除——
  // 它会让用户改到自己看不见的模式上，容易困惑。
  const mode: Mode = settings.appearance.theme === "dark" || (settings.appearance.theme === "system" && systemDark) ? "dark" : "light";
  const updateVisual = (patch: Partial<VisualSetting>) => patchSettings({ visual: { ...settings.visual, ...patch } });
  const updateProfile = (patch: Partial<VisualProfile>) => {
    // 只写入用户真正改动的字段。之前用 resolveVisualProfile 展开会把未配置项
    // （空串）固化成默认色，导致另一模式"莫名有了"默认强调色，
    // 跟随背景切换主题时就会看到颜色被换掉
    const visual = { ...settings.visual };
    visual[mode] = { ...visual[mode], ...patch };
    patchSettings({ visual });
  };
  const profile = resolveVisualProfile(settings, mode);
  // 预设随当前模式切换：深色只列深色预设，浅色只列浅色预设
  const presets = themePresets(mode);
  // 实际生效的表面色（用户没配时由背景推导），用于与预设比对
  const effectiveSurface = resolveCardColor(profile.background, profile.foreground, mode === "dark", profile.card);
  // 四色与某套预设一致才算"选中该预设"，否则视为自定义。
  // 注意 surface 要拿「生效值」比较：选预设时写入的是具体色值，
  // 但若用户点过「自动」，card 变空串、生效值由背景推导，仍应与预设匹配。
  const activePreset = presets.find(preset =>
    preset.accent.toUpperCase() === profile.accent.toUpperCase()
    && preset.background.toUpperCase() === profile.background.toUpperCase()
    && preset.foreground.toUpperCase() === profile.foreground.toUpperCase()
    && preset.surface.toUpperCase() === effectiveSurface.toUpperCase()
  );
  const applyPreset = (id: string) => {
    const preset = presets.find(item => item.id === id);
    if (!preset) return;
    // 一次性覆盖四色：选定主题即得到整套配色
    updateProfile({
      accent: preset.accent,
      background: preset.background,
      card: preset.surface,
      foreground: preset.foreground,
    });
  };
  return <div className="appearance-panel">
    <section aria-labelledby="appearance-style-title">
      <div className="appearance-section-heading">
        <h4 id="appearance-style-title">视觉风格</h4>
      </div>
      <Card><SettingsRow title="模式">
        <div className="appearance-modes" role="radiogroup" aria-label="颜色模式">
          {([{ value: "system", label: "跟随系统" }, { value: "light", label: "浅色模式" }, { value: "dark", label: "深色模式" }] as const).map(option => (
            <label key={option.value} className="appearance-mode-option" title={option.label}>
              <input type="radio" name="appearance-mode" aria-label={option.label} checked={settings.appearance.theme === option.value}
                onChange={() => patchSettings({ appearance: { ...settings.appearance, theme: option.value } })} />
              <ModePreview mode={option.value} />
              {/* 缩略图本身不含文字，三选一并排时无法分辨哪个是「跟随系统」，故补可见标签 */}
              <span className="appearance-mode-label">{option.label}</span>
            </label>
          ))}
        </div>
      </SettingsRow></Card>
      <Card>
        <SettingsRow title="主题" description={`为${mode === "dark" ? "深色" : "浅色"}模式预设整套配色（强调、背景、表面、前景）。选择后会覆盖下面四个颜色。`}>
          <div className="appearance-inline-controls">
            <PillSelect label="主题预设" value={activePreset?.id ?? "custom"}
              options={[...presets.map(preset => ({ value: preset.id, label: preset.name })),
                ...(activePreset ? [] : [{ value: "custom", label: "自定义" }])]}
              onChange={applyPreset} />
          </div>
        </SettingsRow>
        <SettingsRow title="强调色">
          <ColorField label="强调色" value={profile.accent} onChange={accent => updateProfile({ accent })} />
        </SettingsRow>
        <SettingsRow title="背景" description="页面主背景，卡片外围的底色">
          <ColorField label="背景" value={profile.background} onChange={background => updateProfile({ background })} />
        </SettingsRow>
        <SettingsRow title="表面">
          <ColorField label="表面" value={profile.card || effectiveSurface} onChange={card => updateProfile({ card })} />
        </SettingsRow>
        <SettingsRow title="前景"><ColorField label="前景" value={profile.foreground} onChange={foreground => updateProfile({ foreground })} /></SettingsRow>
      </Card>
    </section>
    <AppearanceAdvanced settings={settings} mode={mode} onVisual={updateVisual} onProfile={updateProfile} />
  </div>;
}

/** 字体、字号与对比度：以前折叠在「高级」里，现在直接展示，少一次点击 */
function AppearanceAdvanced({ settings, mode, onVisual, onProfile }: {
  settings: Settings; mode: Mode; onVisual: (patch: Partial<VisualSetting>) => void;
  onProfile: (patch: Partial<VisualProfile>) => void;
}) {
  const visual = settings.visual;
  const profile = resolveVisualProfile(settings, mode);
  return <section className="appearance-advanced">
    <div className="appearance-advanced-heading">
      <h4>字体与对比度</h4>
    </div>
    <div className="appearance-advanced-options">
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
    </div>
  </section>;
}
