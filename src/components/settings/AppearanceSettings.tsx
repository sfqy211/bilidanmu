import { useTranslation as useDesktopTranslation } from "@/i18n";
import { useEffect, useState, type ReactNode } from "react";
import { themePresets } from "@/lib/brand-theme";
import { normalizePriceColors, PRICE_TIERS } from "@/lib/price-chip";
import { FONT_OPTIONS, isHexColor, resolveCardColor, resolveVisualProfile } from "@/lib/visual-theme";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { PriceColors, Settings, VisualFont, VisualProfile, VisualSetting } from "@/types/bilibili";
import { SettingsGroup, SettingsRow, type SettingsPanelProps } from "./SettingsControls";

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
  const { t: translate } = useDesktopTranslation("desktop");
  const [draft, setDraft] = useState(value.toUpperCase());
  useEffect(() => setDraft(value.toUpperCase()), [value]);
  return <div className="appearance-color-field">
    <input type="color" aria-label={translate("appearance.palette", { value: label })} value={value} onChange={event => onChange(event.target.value.toUpperCase())} />
    <input type="text" spellCheck={false} aria-label={translate("appearance.value", { value: label })} maxLength={7} value={draft}
      aria-invalid={!isHexColor(draft)} onChange={event => setDraft(event.target.value)}
      onBlur={() => { if (isHexColor(draft)) onChange(draft.toUpperCase()); else setDraft(value.toUpperCase()); }}
      onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { event.preventDefault(); setDraft(value.toUpperCase()); } }} />
  </div>;
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
  const { t: translate } = useDesktopTranslation("desktop");
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
    <SettingsGroup title={translate("appearance.style")}>
      <SettingsRow title={translate("appearance.mode")}>
        <div className="appearance-modes" role="radiogroup" aria-label={translate("appearance.colorMode")}>
          {([{ value: "system", label: translate("appearance.system") }, { value: "light", label: translate("appearance.light") }, { value: "dark", label: translate("appearance.dark") }] as const).map(option => (
            <label key={option.value} className="appearance-mode-option" title={option.label}>
              <input type="radio" name="appearance-mode" aria-label={option.label} checked={settings.appearance.theme === option.value}
                onChange={() => patchSettings({ appearance: { ...settings.appearance, theme: option.value } })} />
              <ModePreview mode={option.value} />
              {/* 缩略图本身不含文字，三选一并排时无法分辨哪个是「跟随系统」，故补可见标签 */}
              <span className="appearance-mode-label">{option.label}</span>
            </label>
          ))}
        </div>
      </SettingsRow>
      <SettingsRow title={translate("appearance.motion")} description={translate("appearance.motionHint")}>
        <div className="appearance-inline-controls">
          <PillSelect label={translate("appearance.motion")} value={settings.appearance.motion}
            options={[
              { value: "system", label: translate("appearance.motionSystem") },
              { value: "enabled", label: translate("appearance.motionEnabled") },
              { value: "reduced", label: translate("appearance.motionReduced") },
            ]}
            onChange={(motion) => patchSettings({ appearance: { ...settings.appearance, motion: motion as Settings["appearance"]["motion"] } })} />
        </div>
      </SettingsRow>
      <SettingsRow title={translate("appearance.theme")} description={translate("appearance.presetHint", { value: translate(mode === "dark" ? "appearance.darkShort" : "appearance.lightShort") })}>
        <div className="appearance-inline-controls">
          <PillSelect label={translate("appearance.preset")} value={activePreset?.id ?? "custom"}
            options={[...presets.map(preset => ({ value: preset.id, label: translate(`presets.${preset.id}`) })),
              ...(activePreset ? [] : [{ value: "custom", label: translate("appearance.custom") }])]}
            onChange={applyPreset} />
        </div>
      </SettingsRow>
      <SettingsRow title={translate("appearance.accent")}>
        <ColorField label={translate("appearance.accent")} value={profile.accent} onChange={accent => updateProfile({ accent })} />
      </SettingsRow>
      <SettingsRow title={translate("appearance.background")} description={translate("appearance.backgroundHint")}>
        <ColorField label={translate("appearance.background")} value={profile.background} onChange={background => updateProfile({ background })} />
      </SettingsRow>
      <SettingsRow title={translate("appearance.surface")}>
        <ColorField label={translate("appearance.surface")} value={profile.card || effectiveSurface} onChange={card => updateProfile({ card })} />
      </SettingsRow>
      <SettingsRow title={translate("appearance.foreground")}><ColorField label={translate("appearance.foreground")} value={profile.foreground} onChange={foreground => updateProfile({ foreground })} /></SettingsRow>
    </SettingsGroup>
    <PriceColorSettings settings={settings} patchSettings={patchSettings} />
    <AppearanceAdvanced settings={settings} mode={mode} onVisual={updateVisual} onProfile={updateProfile} />
  </div>;
}

/** 金额档位配色：醒目留言与礼物按金额六档，大航海按等级 */
function PriceColorSettings({ settings, patchSettings }: SettingsPanelProps) {
  const { t: translate } = useDesktopTranslation("desktop");
  const colors = normalizePriceColors(settings.appearance.priceColors);
  const update = (key: keyof PriceColors, value: string) => {
    patchSettings({
      appearance: {
        ...settings.appearance,
        priceColors: { ...colors, [key]: value.toUpperCase() },
      },
    });
  };
  // 不单独放「恢复默认」：页面标题右侧的「重置为默认设置」已覆盖 appearance，
  // 同一页面放两个重置入口容易让人以为它们作用范围不同
  return <SettingsGroup
    title={translate("appearance.priceColors")}
    description={translate("appearance.priceHint")}
  >
    <div className="settings-row-block">
      <ColorSwatchRow title={translate("appearance.superChats")}>
        {PRICE_TIERS.map((tier) => (
          <ColorSwatch key={tier.key} label={tier.label} value={colors[tier.key]}
            onChange={(value) => update(tier.key as keyof PriceColors, value)} />
        ))}
      </ColorSwatchRow>
      <ColorSwatchRow title={translate("appearance.memberships")}>
        {([
          { key: "guardGovernor", label: translate("appearance.governor") },
          { key: "guardAdmiral", label: translate("appearance.admiral") },
          { key: "guardCaptain", label: translate("appearance.captain") },
        ] as const).map(({ key, label }) => (
          <ColorSwatch key={key} label={label} value={colors[key]}
            onChange={(value) => update(key, value)} />
        ))}
      </ColorSwatchRow>
    </div>
  </SettingsGroup>;
}

/** 一组取色块（带分组小标题），横向排布并自动换行 */
function ColorSwatchRow({ title, children }: { title: string; children: ReactNode }) {
  return <div className="settings-swatch-group">
    <p className="settings-swatch-group-title">{title}</p>
    <div className="settings-swatch-grid">{children}</div>
  </div>;
}

/**
 * 单个取色块：整块就是原生 color input 的点击热区，
 * 内部圆点显示当前色，下方标签说明档位，悬停显示色值。
 */
function ColorSwatch({ label, value, onChange }: {
  label: string; value: string; onChange: (value: string) => void;
}) {
  const { t: translate } = useDesktopTranslation("desktop");
  return <label className="settings-swatch" data-tooltip={value.toUpperCase()}>
    <span className="settings-swatch-dot" style={{ background: value }}>
      <input type="color" aria-label={translate("appearance.color", { value: label })} value={value}
        onChange={(event) => onChange(event.target.value.toUpperCase())} />
    </span>
    <span className="settings-swatch-label">{label}</span>
  </label>;
}

/** 字体、字号与对比度：以前折叠在「高级」里，现在直接展示，少一次点击 */
function AppearanceAdvanced({ settings, mode, onVisual, onProfile }: {
  settings: Settings; mode: Mode; onVisual: (patch: Partial<VisualSetting>) => void;
  onProfile: (patch: Partial<VisualProfile>) => void;
}) {
  const { t: translate } = useDesktopTranslation("desktop");
  const visual = settings.visual;
  const profile = resolveVisualProfile(settings, mode);
  return <SettingsGroup title={translate("appearance.fonts")}>
    <SettingsRow title={translate("appearance.uiFont")} description={translate("appearance.uiFontHint")}><div className="appearance-inline-controls">
      <PillSelect label={translate("appearance.uiFont")} value={profile.fontFamily} options={FONT_OPTIONS.map(({ value, label }) => ({ value, label: translate(label) }))}
        onChange={fontFamily => onProfile({ fontFamily: fontFamily as VisualFont })} />
      <SizeSelect label={translate("appearance.uiSize")} value={visual.uiFontSize} options={UI_SIZES} onChange={uiFontSize => onVisual({ uiFontSize })} />
    </div></SettingsRow>
    <SettingsRow title={translate("appearance.bodyFont")} description={translate("appearance.bodyFontHint")}><div className="appearance-inline-controls">
      <PillSelect label={translate("appearance.bodyFont")} value={profile.contentFontFamily} options={[{ value: "inherit", label: translate("appearance.matchUi") }, ...FONT_OPTIONS.map(({ value, label }) => ({ value, label: translate(label) }))]}
        onChange={contentFontFamily => onProfile({ contentFontFamily: contentFontFamily as VisualProfile["contentFontFamily"] })} />
      <SizeSelect label={translate("appearance.bodySize")} value={visual.contentFontSize} options={CONTENT_SIZES} onChange={contentFontSize => onVisual({ contentFontSize })} />
    </div></SettingsRow>
    <SettingsRow title={translate("appearance.contrast")} description={translate("appearance.contrastHint")}>
      <label className="appearance-contrast">
        <input type="range" aria-label={translate("appearance.contrast")} value={visual.contrast} min={0} max={100} step={1}
          onChange={event => onVisual({ contrast: event.target.valueAsNumber })} />
        <span className="numeric">{visual.contrast}</span>
      </label>
    </SettingsRow>
  </SettingsGroup>;
}
