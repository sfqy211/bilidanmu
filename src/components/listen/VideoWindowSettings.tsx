import { useTranslation as useDesktopTranslation } from "@/i18n";
import { PanelCheck, PanelField, PanelShell } from "@/components/ui/DanmakuPanel";
import { DanmakuWindowAppearanceSettings } from "@/components/danmaku/DanmakuWindowAppearanceSettings";
import type { VideoWindowPreferences } from "@/types/video-window";

export function VideoWindowSettings({ preferences, onChange, onClose }: {
  preferences: VideoWindowPreferences;
  onChange: (preferences: VideoWindowPreferences) => void;
  onClose: () => void;
}) {
  const { t: translate } = useDesktopTranslation("desktop");
  const ranges = [
    { key: "opacity", label: translate("videoWindowSettings.opacity"), min: 10, max: 100, unit: "%" },
    // 字幕与弹幕共用同一个字号（与直播弹幕窗同一项全局设置）
    { key: "danmakuFontSize", label: translate("videoWindowSettings.fontSize"), min: 10, max: 32, unit: "px" },
  ] as const;
  return (
    <PanelShell
      title={translate("videoWindowSettings.title")}
      variant="sheet"
      onClose={onClose}
      ariaLabel={translate("videoWindowSettings.appearance")}
    >
      <DanmakuWindowAppearanceSettings>
        {ranges.map(({ key, label, min, max, unit }) => (
          <PanelField key={key} label={label} value={`${preferences[key]}${unit}`}>
            <input
              type="range"
              aria-label={label}
              min={min}
              max={max}
              value={preferences[key]}
              onChange={(event) => onChange({ ...preferences, [key]: event.target.valueAsNumber })}
              className="w-full cursor-pointer accent-brand"
            />
          </PanelField>
        ))}
        <PanelField
          label={translate("videoWindowSettings.subtitleRatio")}
          value={`${Math.round(preferences.subtitleRatio * 100)}%`}
        >
          <input
            type="range"
            aria-label={translate("videoWindowSettings.subtitleRatio")}
            min={0}
            max={100}
            value={Math.round(preferences.subtitleRatio * 100)}
            onChange={(event) => onChange({ ...preferences, subtitleRatio: event.target.valueAsNumber / 100 })}
            className="w-full cursor-pointer accent-brand"
          />
        </PanelField>
        <PanelCheck
          label={translate("videoWindowSettings.follow")}
          checked={preferences.autoFollow}
          onChange={(checked) => onChange({ ...preferences, autoFollow: checked })}
        />
        <PanelCheck
          label={translate("videoWindowSettings.time")}
          checked={preferences.showTime}
          onChange={(checked) => onChange({ ...preferences, showTime: checked })}
        />
      </DanmakuWindowAppearanceSettings>
    </PanelShell>
  );
}
