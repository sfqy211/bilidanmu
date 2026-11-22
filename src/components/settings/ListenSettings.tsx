import { useTranslation as useDesktopTranslation } from "@/i18n";
import { SettingsGroup, SettingsRange, SettingsToggle, type SettingsPanelProps } from "./SettingsControls";

export function ListenSettings({ settings, patchSettings }: SettingsPanelProps) {
  const { t: translate } = useDesktopTranslation("desktop");
  const update = (patch: Partial<typeof settings.listen>) => patchSettings({ listen: { ...settings.listen, ...patch } });
  return (
    <>
      <SettingsGroup title={translate("videoSettings.playback")}>
        <SettingsToggle title={translate("videoSettings.autoNext")} description={translate("videoSettings.autoNextHint")}
          checked={settings.listen.autoNext} onChange={(autoNext) => update({ autoNext })} />
      </SettingsGroup>
      <SettingsGroup title={translate("videoSettings.subtitles")} description={translate("videoSettings.subtitlesHint")}>
        <SettingsRange title={translate("videoSettings.size")} value={settings.listen.subtitleFontSize} min={14} max={24} unit="px"
          onChange={(subtitleFontSize) => update({ subtitleFontSize })} />
        <SettingsToggle title={translate("videoSettings.autoFollow")} description={translate("videoSettings.autoFollowHint")}
          checked={settings.listen.subtitleAutoFollow} onChange={(subtitleAutoFollow) => update({ subtitleAutoFollow })} />
        <SettingsToggle title={translate("videoSettings.showTime")} description={translate("videoSettings.showTimeHint")}
          checked={settings.listen.subtitleShowTime} onChange={(subtitleShowTime) => update({ subtitleShowTime })} />
      </SettingsGroup>
    </>
  );
}
