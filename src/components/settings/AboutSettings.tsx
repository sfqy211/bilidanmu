import { useTranslation as useDesktopTranslation } from "@/i18n";
import { useEffect, useState } from "react";
import { ExternalLink, FolderOpen, GitBranch } from "lucide-react";
import { UpdateDialog } from "@/components/ui/UpdateDialog";
import { BrandLogo } from "@/components/BrandLogo";
import { getAppVersion } from "@/lib/constants";
import { tauriCommands } from "@/lib/tauri";
import type { UpdateInfo } from "@/types/bilibili";
import { SettingsGroup, SettingsRow } from "./SettingsControls";

export function AboutSettings() {
  const { t: translate } = useDesktopTranslation("desktop");
  const [version, setVersion] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => { getAppVersion().then(setVersion).catch(() => {}); }, []);

  const checkUpdate = async () => {
    setChecking(true);
    setResult(null);
    setError(null);
    try {
      const info = await tauriCommands.update.check();
      if (info.hasUpdate) setUpdateInfo(info);
      else setResult(translate("about.upToDate"));
    } catch { setError(translate("about.updateFailed")); }
    finally { setChecking(false); }
  };
  const openLogs = async () => {
    setError(null);
    try { await tauriCommands.log.openDir(); }
    catch (reason) { setError(translate("about.openFailed", { value: String(reason) })); }
  };
  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <BrandLogo className="h-12 w-12 shrink-0 text-brand" />
        <div className="flex h-12 flex-col justify-center">
          <h3 className="text-base font-semibold text-ink">BiliDanmu {version && <span className="numeric ml-1 text-xs font-normal text-ink-muted">v{version}</span>}</h3>
          <p className="mt-0.5 text-xs text-ink-muted">{translate("about.subtitle")}</p>
        </div>
      </div>
      <SettingsGroup title={translate("about.help")}>
        <SettingsRow title={translate("about.check")} description={result || translate("about.checkHint")}>
          <button type="button" className="settings-action" disabled={checking} onClick={() => void checkUpdate()}>{checking ? translate("about.checking") : translate("about.check")}</button>
        </SettingsRow>
        <SettingsRow title={translate("about.feedback")}>
          <a href="https://github.com/sfqy211/bilidanmu/issues" target="_blank" rel="noopener noreferrer" className="settings-action">GitHub Issues <ExternalLink className="h-3.5 w-3.5" /></a>
        </SettingsRow>
        <SettingsRow title={translate("about.source")}>
          <a href="https://github.com/sfqy211/bilidanmu" target="_blank" rel="noopener noreferrer" className="settings-action"><GitBranch className="h-3.5 w-3.5" />{" " + translate("about.repo")}</a>
        </SettingsRow>
        <SettingsRow title={translate("about.logs")} description={translate("about.logsHint")}>
          <button type="button" className="settings-action" onClick={() => void openLogs()}><FolderOpen className="h-3.5 w-3.5" />{" " + translate("about.open")}</button>
        </SettingsRow>
        {error && <p className="settings-row-block text-xs text-rose-600 dark:text-rose-300" role="alert">{error}</p>}
      </SettingsGroup>
      <SettingsGroup title={translate("about.disclaimer")}>
        <p className="settings-row-block text-xs leading-relaxed text-ink-muted">
          {translate("about.disclaimerText")}
        </p>
      </SettingsGroup>
      <UpdateDialog updateInfo={updateInfo} onDismiss={() => setUpdateInfo(null)} />
    </>
  );
}
