import { useEffect, useState } from "react";
import { ExternalLink, FolderOpen, GitBranch } from "lucide-react";
import { UpdateDialog } from "@/components/ui/UpdateDialog";
import { getAppVersion } from "@/lib/constants";
import { tauriCommands } from "@/lib/tauri";
import aboutIcon from "@/assets/icon.png";
import type { UpdateInfo } from "@/types/bilibili";
import { SettingsGroup, SettingsRow } from "./SettingsControls";

export function AboutSettings() {
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
      else setResult("已是最新版本");
    } catch { setError("检查更新失败，请稍后重试。"); }
    finally { setChecking(false); }
  };
  const openLogs = async () => {
    setError(null);
    try { await tauriCommands.log.openDir(); }
    catch (reason) { setError(`打开日志目录失败：${String(reason)}`); }
  };
  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <img src={aboutIcon} alt="" className="h-10 w-10 rounded-lg" />
        <div>
          <h3 className="text-base font-semibold text-ink">BiliDanmu {version && <span className="numeric ml-1 text-xs font-normal text-ink-muted">v{version}</span>}</h3>
          <p className="mt-0.5 text-xs text-ink-muted">Bilibili 直播弹幕客户端 · AGPLv3</p>
        </div>
      </div>
      <SettingsGroup title="更新与帮助">
        <SettingsRow title="检查更新" description={result || "获取最新发布版本。"}>
          <button type="button" className="settings-action" disabled={checking} onClick={() => void checkUpdate()}>{checking ? "检查中…" : "检查更新"}</button>
        </SettingsRow>
        <SettingsRow title="反馈问题">
          <a href="https://github.com/sfqy211/bilidanmu/issues" target="_blank" rel="noopener noreferrer" className="settings-action">GitHub Issues <ExternalLink className="h-3.5 w-3.5" /></a>
        </SettingsRow>
        <SettingsRow title="源代码">
          <a href="https://github.com/sfqy211/bilidanmu" target="_blank" rel="noopener noreferrer" className="settings-action"><GitBranch className="h-3.5 w-3.5" /> 项目仓库</a>
        </SettingsRow>
        <SettingsRow title="日志目录" description="排查问题时可以查看运行日志。">
          <button type="button" className="settings-action" onClick={() => void openLogs()}><FolderOpen className="h-3.5 w-3.5" /> 打开目录</button>
        </SettingsRow>
        {error && <p className="settings-row-block text-xs text-rose-600 dark:text-rose-300" role="alert">{error}</p>}
      </SettingsGroup>
      <SettingsGroup title="免责声明">
        <p className="settings-row-block text-xs leading-relaxed text-ink-muted">
          本软件为开源项目，仅供学习和研究使用。使用本软件所产生的任何后果由使用者自行承担。
          本软件不保证与 B 站服务的兼容性，不保证功能的持续可用性。
          使用本软件时应遵守相关法律法规，不得用于任何商业用途。
          本软件不收集任何用户数据。
        </p>
      </SettingsGroup>
      <UpdateDialog updateInfo={updateInfo} onDismiss={() => setUpdateInfo(null)} />
    </>
  );
}
