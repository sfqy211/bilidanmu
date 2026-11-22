import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "@/i18n";
import { LANGUAGES, resolveLocale } from "@/i18n/languages";
import { refreshLocale } from "@/i18n/locale-sync";
import { tauriCommands } from "@/lib/tauri";
import { SettingsChoice, SettingsGroup, SettingsToggle, type SettingsPanelProps } from "./SettingsControls";
import type { Settings } from "@/types/bilibili";

export function GeneralSettings({ settings, patchSettings }: SettingsPanelProps) {
  const { t } = useTranslation(["settings", "common", "danmaku"]);
  const [savingLanguage, setSavingLanguage] = useState(false);

  const changeLanguage = async (value: string) => {
    setSavingLanguage(true);
    try {
      await tauriCommands.settings.setLocale(resolveLocale(value));
      await refreshLocale();
    } catch {
      toast.error(t("general.languageSaveFailed"));
    } finally {
      setSavingLanguage(false);
    }
  };

  return (
    <>
      <SettingsGroup title={t("general.windowBehavior")}>
        <SettingsChoice title={t("general.onClose")} description={t("general.onCloseHint")}
          value={settings.closeBehavior} onChange={(closeBehavior) => patchSettings({ closeBehavior: closeBehavior as Settings["closeBehavior"] })}
          options={[{ value: "ask", label: t("general.ask") }, { value: "hide", label: t("common:window.hide") }, { value: "exit", label: t("common:window.quit") }]} />
        <SettingsToggle title={t("general.silentStart")} description={t("general.silentStartHint")}
          checked={settings.silentStart} onChange={(silentStart) => patchSettings({ silentStart })} />
        <SettingsChoice title={t("general.startupView")} description={t("general.startupViewHint")}
          value={settings.startupView}
          onChange={(startupView) => patchSettings({ startupView: startupView as Settings["startupView"] })}
          options={[{ value: "danmaku", label: t("danmaku:window") }, { value: "main", label: t("general.mainView") }]} />
      </SettingsGroup>
      <SettingsGroup title={t("general.display")}>
        {import.meta.env.DEV && (
          <SettingsChoice title={t("general.language")} value={settings.locale}
            options={LANGUAGES} disabled={savingLanguage} onChange={(value) => void changeLanguage(value)} />
        )}
        <SettingsToggle title={t("general.showAvatars")} description={t("general.showAvatarsHint")}
          checked={settings.showAvatars} onChange={(showAvatars) => patchSettings({ showAvatars })} />
      </SettingsGroup>
    </>
  );
}
