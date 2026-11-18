import { PanelCheck, PanelField, PanelShell } from "@/components/ui/DanmakuPanel";
import { DanmakuWindowAppearanceSettings } from "@/components/danmaku/DanmakuWindowAppearanceSettings";
import type { VideoWindowPreferences } from "@/types/video-window";

export function VideoWindowSettings({ preferences, onChange, onClose }: {
  preferences: VideoWindowPreferences;
  onChange: (preferences: VideoWindowPreferences) => void;
  onClose: () => void;
}) {
  const ranges = [
    { key: "opacity", label: "背景不透明度", min: 10, max: 100, unit: "%" },
    // 字幕与弹幕共用同一个字号（与直播弹幕窗同一项全局设置）
    { key: "danmakuFontSize", label: "字幕与弹幕字号", min: 10, max: 32, unit: "px" },
  ] as const;
  return (
    <PanelShell
      title="窗口设置"
      variant="sheet"
      onClose={onClose}
      ariaLabel="视频弹幕外观设置"
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
          label="字幕区域比例"
          value={`${Math.round(preferences.subtitleRatio * 100)}%`}
        >
          <input
            type="range"
            aria-label="字幕区域比例"
            min={0}
            max={100}
            value={Math.round(preferences.subtitleRatio * 100)}
            onChange={(event) => onChange({ ...preferences, subtitleRatio: event.target.valueAsNumber / 100 })}
            className="w-full cursor-pointer accent-brand"
          />
        </PanelField>
        <PanelCheck
          label="字幕与弹幕自动跟随"
          checked={preferences.autoFollow}
          onChange={(checked) => onChange({ ...preferences, autoFollow: checked })}
        />
        <PanelCheck
          label="显示行内时间"
          checked={preferences.showTime}
          onChange={(checked) => onChange({ ...preferences, showTime: checked })}
        />
      </DanmakuWindowAppearanceSettings>
    </PanelShell>
  );
}
