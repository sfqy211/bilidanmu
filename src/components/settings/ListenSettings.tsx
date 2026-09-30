import { SettingsChoice, SettingsGroup, SettingsRange, SettingsToggle, type SettingsPanelProps } from "./SettingsControls";

export function ListenSettings({ settings, patchSettings }: SettingsPanelProps) {
  const update = (patch: Partial<typeof settings.listen>) => patchSettings({ listen: { ...settings.listen, ...patch } });
  return (
    <>
      <SettingsGroup title="播放">
        <SettingsRange title="默认音量" description="用于启动时的听视频音量，与直播音量独立。播放器内的临时调节不会改动此默认值。"
          value={settings.listen.defaultVolume} min={0} max={100} unit="%" onChange={(defaultVolume) => update({ defaultVolume })} />
        <SettingsToggle title="自动连播" description="当前曲目结束后继续播放列表中的下一首；关闭后每首结束时停止。"
          checked={settings.listen.autoNext} onChange={(autoNext) => update({ autoNext })} />
      </SettingsGroup>
      <SettingsGroup title="字幕" description="用于视频自带字幕，点击字幕仍可跳转到对应时间。">
        <SettingsRange title="字幕字号" value={settings.listen.subtitleFontSize} min={14} max={24} unit="px"
          onChange={(subtitleFontSize) => update({ subtitleFontSize })} />
        <SettingsToggle title="自动跟随播放" description="将当前字幕保持在阅读区中间。手动浏览时暂停跟随，3 秒后恢复。"
          checked={settings.listen.subtitleAutoFollow} onChange={(subtitleAutoFollow) => update({ subtitleAutoFollow })} />
        <SettingsToggle title="显示时间标记" description="在字幕旁显示开始时间，方便浏览和定位。"
          checked={settings.listen.subtitleShowTime} onChange={(subtitleShowTime) => update({ subtitleShowTime })} />
      </SettingsGroup>
      <SettingsGroup title="播放器外观">
        <SettingsChoice title="默认播放器视图" description="进入播放器时使用此视图，播放中仍可随时切换。"
          value={settings.listen.defaultView} onChange={(value) => update({ defaultView: value === "subtitles" ? "subtitles" : "cover" })}
          options={[{ value: "cover", label: "封面与字幕" }, { value: "subtitles", label: "专注字幕" }]} />
      </SettingsGroup>
    </>
  );
}
