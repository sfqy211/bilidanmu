import { useTranslation as useDesktopTranslation } from "@/i18n";
import { useCallback, useEffect, useState } from "react";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";
import { SettingsGroup, SettingsRow, type SettingsPanelProps } from "./SettingsControls";
import type { Settings } from "@/types/bilibili";

type ShortcutKey = keyof Settings["shortcuts"];

const GLOBAL_ACTIONS = [
  { key: "toggleWindow", title: "shortcuts.toggle", description: "shortcuts.toggleHint", def: "Ctrl+Alt+D" },
  { key: "toggleInputOnly", title: "shortcuts.compact", description: "shortcuts.compactHint", def: "Ctrl+Alt+B" },
  { key: "toggleAudio", title: "shortcuts.audio", description: "shortcuts.audioHint", def: null },
  { key: "toggleMute", title: "shortcuts.mute", description: "shortcuts.muteHint", def: null },
] as const;

const ZOOM_ACTIONS = [
  { key: "uiZoomIn", title: "shortcuts.zoomIn", def: "Ctrl+=" },
  { key: "uiZoomOut", title: "shortcuts.zoomOut", def: "Ctrl+-" },
  { key: "uiZoomReset", title: "shortcuts.resetZoom", def: "Ctrl+0" },
] as const;

const ALL_ACTIONS = [...GLOBAL_ACTIONS, ...ZOOM_ACTIONS];
type ActionDef = (typeof ALL_ACTIONS)[number];
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
  const { t: translate } = useDesktopTranslation("desktop");
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
          {translate("shortcuts.press")}
        </button>
      ) : (
        <button
          type="button"
          className="settings-action min-w-[92px] font-mono text-xs"
          onClick={() => setListening(true)}
          title={translate("shortcuts.pressHint")}
        >
          {value ?? translate("shortcuts.unassigned")}
        </button>
      )}
      {value && (
        <button type="button" className="settings-action" onClick={onClear} title={translate("shortcuts.clearHint")}>
          {translate("shortcuts.clear")}
        </button>
      )}
      {!isDefault && (
        <button type="button" className="settings-action" onClick={onReset} title={translate("shortcuts.resetHint")}>
          {translate("shortcuts.default")}
        </button>
      )}
    </div>
  );
}

export function ShortcutsSettings({ settings, patchSettings }: SettingsPanelProps) {
  const { t: translate } = useDesktopTranslation("desktop");
  const [conflict, setConflict] = useState<string | null>(null);
  // 全局快捷键注册失败清单（Rust 侧注册结果，如被其它程序占用）
  const [regErrors, setRegErrors] = useState<string[]>([]);

  const refreshErrors = useCallback(() => {
    void tauriCommands.settings
      .getShortcutErrors()
      .then((errors) => setRegErrors(errors ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshErrors();
  }, [refreshErrors]);

  const commit = useCallback(
    (key: ShortcutKey, value: string | null) => {
      // 冲突检测：同一组合不允许绑到两个动作
      if (value !== null) {
        const holder = ALL_ACTIONS.find((a) => a.key !== key && settings.shortcuts[a.key] === value);
        if (holder) {
          setConflict(translate("shortcuts.conflict", { value, value2: translate(holder.title) }));
          return;
        }
      }
      setConflict(null);
      patchSettings({ shortcuts: { ...settings.shortcuts, [key]: value } });
      // 保存命令在 Rust 侧同步完成快捷键重注册，完成后刷新注册结果
      void useSettingsStore.getState().saveSettings().then(refreshErrors);
    },
    [settings.shortcuts, patchSettings, refreshErrors, translate]
  );

  const renderRow = (action: ActionDef) => {
    const value = settings.shortcuts[action.key] ?? null;
    return (
      <SettingsRow key={action.key} title={translate(action.title)} description={"description" in action ? translate(action.description) : undefined}>
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
      <SettingsGroup title={translate("shortcuts.global")} description={translate("shortcuts.globalHint")}>
        {GLOBAL_ACTIONS.map(renderRow)}
      </SettingsGroup>
      <SettingsGroup title={translate("shortcuts.app")} description={translate("shortcuts.appHint")}>
        {ZOOM_ACTIONS.map(renderRow)}
        <SettingsRow title={translate("shortcuts.composer")}>
          <span className="text-xs text-ink-muted">Enter / Esc / ↑</span>
        </SettingsRow>
        <SettingsRow title={translate("shortcuts.danmakuSize")}>
          <span className="text-xs text-ink-muted">{translate("shortcuts.wheel")}</span>
        </SettingsRow>
      </SettingsGroup>
      <p className="text-xs leading-relaxed text-ink-muted">
        {translate("shortcuts.fixed")}
      </p>
      {conflict && (
        <p className="settings-row-block text-xs text-rose-600 dark:text-rose-300" role="alert">
          {conflict}
        </p>
      )}
      {regErrors.length > 0 && (
        <div className="settings-row-block text-xs text-amber-600 dark:text-amber-300" role="alert">
          {regErrors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
    </>
  );
}
