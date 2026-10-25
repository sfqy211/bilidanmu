import { useCallback, useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { SettingsGroup, SettingsRow, type SettingsPanelProps } from "./SettingsControls";
import type { Settings } from "@/types/bilibili";

type ShortcutKey = keyof Settings["shortcuts"];

interface ActionDef {
  key: ShortcutKey;
  title: string;
  description?: string;
  def: string | null;
}

const GLOBAL_ACTIONS: ActionDef[] = [
  { key: "toggleWindow", title: "显示/隐藏应用窗口", description: "与托盘左键单击相同：连接房间时切换弹幕窗，否则切换主窗口。", def: "Ctrl+Alt+D" },
  { key: "toggleInputOnly", title: "仅输入框模式", description: "弹幕窗进入/退出仅输入框紧凑模式。", def: "Ctrl+Alt+B" },
  { key: "toggleAudio", title: "音频播放/暂停", description: "控制直播间音频流的播放与暂停。", def: null },
  { key: "toggleMute", title: "音频静音", description: "静音/恢复直播间音频。", def: null },
];

const ZOOM_ACTIONS: ActionDef[] = [
  { key: "uiZoomIn", title: "界面放大", def: "Ctrl+=" },
  { key: "uiZoomOut", title: "界面缩小", def: "Ctrl+-" },
  { key: "uiZoomReset", title: "重置界面缩放", def: "Ctrl+0" },
];

const ALL_ACTIONS = [...GLOBAL_ACTIONS, ...ZOOM_ACTIONS];
const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

/** 键盘事件 → 组合键文本（如 "Ctrl+Alt+B"）；无法表达的键返回 null */
function comboFromEvent(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Cmd");
  let key: string | null = null;
  if (e.key.length === 1) key = e.key.toUpperCase();
  else if (/^F\d{1,2}$/.test(e.key)) key = e.key;
  else if (e.key.startsWith("Arrow")) key = e.key.slice(5);
  return key ? [...parts, key].join("+") : null;
}

function ShortcutRecorder({
  value,
  onRecord,
  onClear,
  onReset,
  isDefault,
}: {
  value: string | null;
  onRecord: (combo: string) => void;
  onClear: () => void;
  onReset: () => void;
  isDefault: boolean;
}) {
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setListening(false);
        return;
      }
      if (MODIFIER_KEYS.has(e.key)) return; // 单独按修饰键：等待组合完成
      const combo = comboFromEvent(e);
      // 必须含 Ctrl/Alt/Cmd 修饰：纯单键会与正常输入冲突
      if (combo && /Ctrl|Alt|Cmd/.test(combo)) {
        onRecord(combo);
      }
      setListening(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [listening, onRecord]);

  return (
    <div className="flex items-center gap-1.5">
      {listening ? (
        <button
          type="button"
          className="settings-action text-pink-500"
          onClick={() => setListening(false)}
        >
          按下新组合…（Esc 取消）
        </button>
      ) : (
        <button
          type="button"
          className="settings-action min-w-[92px] font-mono text-xs"
          onClick={() => setListening(true)}
          title="点击后按下新的组合键"
        >
          {value ?? "未设置"}
        </button>
      )}
      {value && (
        <button type="button" className="settings-action" onClick={onClear} title="清除绑定（停用该快捷键）">
          清除
        </button>
      )}
      {!isDefault && (
        <button type="button" className="settings-action" onClick={onReset} title="恢复默认绑定">
          默认
        </button>
      )}
    </div>
  );
}

export function ShortcutsSettings({ settings, patchSettings }: SettingsPanelProps) {
  const [conflict, setConflict] = useState<string | null>(null);

  const commit = useCallback(
    (key: ShortcutKey, value: string | null) => {
      // 冲突检测：同一组合不允许绑到两个动作
      if (value !== null) {
        const holder = ALL_ACTIONS.find((a) => a.key !== key && settings.shortcuts[a.key] === value);
        if (holder) {
          setConflict(`${value} 已绑定到「${holder.title}」`);
          return;
        }
      }
      setConflict(null);
      patchSettings({ shortcuts: { ...settings.shortcuts, [key]: value } });
      void useSettingsStore.getState().saveSettings();
    },
    [settings.shortcuts, patchSettings]
  );

  const renderRow = (action: ActionDef) => {
    const value = settings.shortcuts[action.key] ?? null;
    return (
      <SettingsRow key={action.key} title={action.title} description={action.description}>
        <ShortcutRecorder
          value={value}
          isDefault={value === action.def}
          onRecord={(combo) => commit(action.key, combo)}
          onClear={() => commit(action.key, null)}
          onReset={() => commit(action.key, action.def)}
        />
      </SettingsRow>
    );
  };

  return (
    <>
      <SettingsGroup title="全局快捷键" description="在任何应用前台时都能触发；清除绑定即停用，修改后立即生效并保存。">
        {GLOBAL_ACTIONS.map(renderRow)}
      </SettingsGroup>
      <SettingsGroup title="应用内快捷键" description="仅在应用窗口内生效。">
        {ZOOM_ACTIONS.map(renderRow)}
        <SettingsRow title="发送弹幕 / 关闭弹层 / 输入历史">
          <span className="text-xs text-ink-muted">Enter / Esc / ↑</span>
        </SettingsRow>
        <SettingsRow title="调整弹幕字号">
          <span className="text-xs text-ink-muted">Ctrl + 滚轮</span>
        </SettingsRow>
      </SettingsGroup>
      <p className="text-xs leading-relaxed text-ink-muted">
        Enter / Esc / ↑ 属于输入框惯例键，开放修改会破坏打字与输入法体验，暂不提供自定义。
      </p>
      {conflict && (
        <p className="settings-row-block text-xs text-rose-600 dark:text-rose-300" role="alert">
          {conflict}
        </p>
      )}
    </>
  );
}
