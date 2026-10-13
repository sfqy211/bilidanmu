import { SettingsChoice, SettingsGroup, SettingsRow, type SettingsPanelProps } from "./SettingsControls";
import type { Settings } from "@/types/bilibili";

export function GeneralSettings({ settings, patchSettings }: SettingsPanelProps) {
  return (
    <>
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
