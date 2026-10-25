import { SettingsGroup, SettingsRange, SettingsToggle, type SettingsPanelProps } from "./SettingsControls";

export function ListenSettings({ settings, patchSettings }: SettingsPanelProps) {
  const update = (patch: Partial<typeof settings.listen>) => patchSettings({ listen: { ...settings.listen, ...patch } });
  return (
    <>
      <SettingsGroup title="播放">
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
      <SettingsGroup title="视频封面">
        <SettingsToggle title="显示视频封面" description="在视频列表、播放页标题旁和底部播放栏展示封面；关闭后都只显示文字。"
          checked={settings.listen.showCovers} onChange={(showCovers) => update({ showCovers })} />
      </SettingsGroup>
    </>
  );
}
