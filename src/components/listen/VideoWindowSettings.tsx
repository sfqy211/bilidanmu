import { X } from "lucide-react";
import { DanmakuWindowButton } from "@/components/danmaku/DanmakuWindow";
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
  return <section className="video-window-popover video-window-settings" aria-label="视频弹幕外观设置" data-interactive>
    <header><h2>窗口设置</h2><DanmakuWindowButton title="关闭设置" onClick={onClose}><X /></DanmakuWindowButton></header>
    <DanmakuWindowAppearanceSettings switcherLabel="视频切换">
    {ranges.map(({ key, label, min, max, unit }) => <label className="video-window-setting" key={key}>
      <span>{label}<span className="numeric">{preferences[key]}{unit}</span></span>
      <input type="range" aria-label={label} min={min} max={max} value={preferences[key]} onChange={(event) => onChange({ ...preferences, [key]: event.target.valueAsNumber })} />
    </label>)}
    <label className="video-window-setting"><span>字幕区域比例<span className="numeric">{Math.round(preferences.subtitleRatio * 100)}%</span></span>
      <input type="range" aria-label="字幕区域比例" min={0} max={100} value={Math.round(preferences.subtitleRatio * 100)} onChange={(event) => onChange({ ...preferences, subtitleRatio: event.target.valueAsNumber / 100 })} />
    </label>
    <label className="video-window-check"><span>字幕与弹幕自动跟随</span><input type="checkbox" aria-label="字幕与弹幕自动跟随" checked={preferences.autoFollow} onChange={(event) => onChange({ ...preferences, autoFollow: event.target.checked })} /></label>
    <label className="video-window-check"><span>显示行内时间</span><input type="checkbox" aria-label="显示行内时间" checked={preferences.showTime} onChange={(event) => onChange({ ...preferences, showTime: event.target.checked })} /></label>
    </DanmakuWindowAppearanceSettings>
  </section>;
}
