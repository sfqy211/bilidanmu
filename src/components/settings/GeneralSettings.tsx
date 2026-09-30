import { BRAND_PRESETS, DEFAULT_BRAND } from "@/lib/brand-theme";
import { SettingsChoice, SettingsGroup, SettingsRow, type SettingsPanelProps } from "./SettingsControls";
import type { Settings } from "@/types/bilibili";

export function GeneralSettings({ settings, patchSettings }: SettingsPanelProps) {
  const appearance = settings.appearance;
  return (
    <>
      <SettingsGroup title="主题与颜色">
        <SettingsChoice title="颜色模式" value={appearance.theme}
          onChange={(theme) => patchSettings({ appearance: { ...appearance, theme: theme as Settings["appearance"]["theme"] } })}
          options={[{ value: "system", label: "跟随系统" }, { value: "light", label: "浅色" }, { value: "dark", label: "深色" }]} />
        <div className="settings-row-block">
          <p className="mb-3 text-[13px] text-ink">主题色</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="主题色预设">
            {BRAND_PRESETS.map((preset) => {
              const active = appearance.themeAccentLight.toLowerCase() === preset.light.toLowerCase()
                && appearance.themeAccentDark.toLowerCase() === preset.dark.toLowerCase();
              return (
                <button key={preset.name} type="button" aria-pressed={active} title={preset.name}
                  className="settings-color-preset" onClick={() => patchSettings({ appearance: {
                    ...appearance, themeAccentLight: preset.light, themeAccentDark: preset.dark,
                  } })}>
                  <span className="h-3 w-3 rounded-full" style={{ background: `linear-gradient(90deg, ${preset.light} 50%, ${preset.dark} 50%)` }} />
                  {preset.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
          <details className="mt-3 text-xs text-ink-muted">
            <summary className="cursor-pointer py-1">自定义明暗主题色</summary>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
              {([{ key: "themeAccentLight", label: "浅色模式", fallback: DEFAULT_BRAND.light },
                { key: "themeAccentDark", label: "深色模式", fallback: DEFAULT_BRAND.dark }] as const).map(({ key, label, fallback }) => (
                <label key={key} className="flex items-center gap-2">
                  {label}
                  <input type="color" aria-label={`${label}主题色`} value={appearance[key] || fallback}
                    onChange={(event) => patchSettings({ appearance: { ...appearance, [key]: event.target.value } })}
                    className="h-7 w-9 cursor-pointer rounded-md border border-subtle bg-transparent p-0.5" />
                  <span className="numeric">{appearance[key] || fallback}</span>
                </label>
              ))}
            </div>
          </details>
        </div>
      </SettingsGroup>
      <SettingsGroup title="窗口行为">
        <SettingsChoice title="关闭主窗口时" description="弹幕窗口关闭时始终隐藏到托盘；断开直播间请使用退出按钮。"
          value={settings.closeBehavior} onChange={(closeBehavior) => patchSettings({ closeBehavior: closeBehavior as Settings["closeBehavior"] })}
          options={[{ value: "ask", label: "每次询问" }, { value: "hide", label: "隐藏到托盘" }, { value: "exit", label: "退出程序" }]} />
      </SettingsGroup>
      <SettingsGroup title="快捷键">
        <SettingsRow title="界面缩放"><span className="text-xs text-ink-muted">Ctrl + − / +</span></SettingsRow>
        <SettingsRow title="重置界面缩放"><span className="text-xs text-ink-muted">Ctrl + 0</span></SettingsRow>
        <SettingsRow title="调整弹幕字号"><span className="text-xs text-ink-muted">Ctrl + 滚轮</span></SettingsRow>
      </SettingsGroup>
    </>
  );
}
