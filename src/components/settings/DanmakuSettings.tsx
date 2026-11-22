import { useTranslation as useDesktopTranslation } from "@/i18n";
import { useState } from "react";
import { Ghost, ListVideo, Lock, MousePointerClick, Pin, TextCursorInput, Unlock, X } from "lucide-react";
import { ACTIVITY_BAR_MODES, ACTIVITY_FILTERS, HIDE_APPEARANCE_KEYS } from "./constants";
import { SettingsChoice, SettingsGroup, SettingsRange, SettingsToggle, type SettingsPanelProps } from "./SettingsControls";
import type { Settings } from "@/types/bilibili";

/**
 * 标题栏按钮清单（与 TitleBarButtons 字段一一对应）。
 * 图标与弹幕窗标题栏实际按钮保持一致，便于对号入座。
 * 退出直播间必须保留，不在清单内、不可关闭。
 */

/** 独立强调色预设（与设置页主题色板同源的常用色） */
const ACCENT_PRESETS = ["#E11D48", "#e95780", "#467fba", "#469480", "#7C3AED", "#D97706"];

export function DanmakuSettings({ settings, patchSettings }: SettingsPanelProps) {
  const { t: translate } = useDesktopTranslation("desktop");
  const TITLE_BAR_BUTTONS = [
    { key: "pin", label: translate("danmakuSettings.pin"), Icon: Pin },
    { key: "lock", label: translate("danmakuSettings.lock"), Icon: Lock },
    { key: "inputOnly", label: translate("danmakuSettings.inputOnly"), Icon: TextCursorInput },
    { key: "passthrough", label: translate("danmakuSettings.clickThrough"), Icon: MousePointerClick },
    { key: "stealth", label: translate("danmakuSettings.stealth"), Icon: Ghost },
    { key: "roomSwitcher", label: translate("danmakuSettings.switchRoom"), Icon: ListVideo },
    { key: "close", label: translate("danmakuSettings.hideToTray"), Icon: X },
  ] as const;
  const appearance = settings.appearance;
  // 兜底：旧持久化数据可能没有 danmakuWindow（深合并修好前写入的数据）
  const dw = appearance.danmakuWindow ?? {
    accentMode: "follow" as const,
    accentColor: "#E11D48",
    functionBar: "pinned" as const,
    dockEnabled: true,
    dockIndicator: true,
  };
  const update = (patch: Partial<Settings["appearance"]>) => patchSettings({ appearance: { ...appearance, ...patch } });
  return (
    <>
      <SettingsGroup title={translate("danmakuSettings.windowText")}>
        <SettingsRange title={translate("danmakuSettings.textSize")} value={appearance.fontSize} min={10} max={32} unit="px" onChange={(fontSize) => update({ fontSize })} />
        <SettingsRange title={translate("danmakuSettings.opacity")} description={translate("danmakuSettings.opacityHint")} value={appearance.opacity} min={10} max={100} unit="%" onChange={(opacity) => update({ opacity })} />
        <SettingsChoice title={translate("danmakuSettings.dockAnimation")} value={String(appearance.dockAnimMs)} onChange={(value) => update({ dockAnimMs: Number(value) })}
          options={[{ value: "0", label: translate("danmakuSettings.off") }, { value: "120", label: translate("danmakuSettings.fast") }, { value: "220", label: translate("danmakuSettings.standard") }, { value: "350", label: translate("danmakuSettings.slow") },
            ...([0, 120, 220, 350].includes(appearance.dockAnimMs) ? [] : [{ value: String(appearance.dockAnimMs), label: translate("danmakuSettings.customSpeed", { value: appearance.dockAnimMs }) }])]} />
        <SettingsToggle
          title={translate("danmakuSettings.followBackground")}
          description={translate("danmakuSettings.backgroundHint")}
          checked={appearance.autoThemeFromBackground ?? false}
          onChange={(autoThemeFromBackground) => update({ autoThemeFromBackground })}
        />
      </SettingsGroup>
      <SettingsGroup title={translate("danmakuSettings.appearance")} description={translate("danmakuSettings.appearanceHint")}>
        <SettingsChoice title={translate("danmakuSettings.accent")} value={dw.accentMode}
          onChange={(accentMode) => update({ danmakuWindow: { ...dw, accentMode: accentMode as typeof dw.accentMode } })}
          options={[{ value: "follow", label: translate("danmakuSettings.matchTheme") }, { value: "custom", label: translate("danmakuSettings.independentAccent") }]} />
        {dw.accentMode === "custom" && (
          <div className="settings-row-block">
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_PRESETS.map((color) => (
                <button key={color} type="button" aria-label={color} aria-pressed={dw.accentColor === color}
                  onClick={() => update({ danmakuWindow: { ...dw, accentColor: color } })}
                  className={`h-7 w-7 rounded-full border-2 transition ${dw.accentColor === color ? "border-ink" : "border-transparent hover:border-ink/30"}`}
                  style={{ background: color }} />
              ))}
              <input type="color" aria-label={translate("danmakuSettings.customAccent")} value={/^#[\da-fA-F]{6}$/.test(dw.accentColor) ? dw.accentColor : "#E11D48"}
                onChange={(event) => update({ danmakuWindow: { ...dw, accentColor: event.target.value } })}
                className="h-7 w-9 cursor-pointer rounded border border-subtle bg-transparent" />
            </div>
          </div>
        )}
        <SettingsChoice title={translate("danmakuSettings.actionBar")} value={dw.functionBar}
          onChange={(functionBar) => update({ danmakuWindow: { ...dw, functionBar: functionBar as typeof dw.functionBar } })}
          options={[{ value: "pinned", label: translate("danmakuSettings.allActions") }, { value: "compact", label: translate("danmakuSettings.compactActions") }]} />
        <SettingsToggle title={translate("danmakuSettings.showDock")} description={translate("danmakuSettings.showDockHint")}
          checked={dw.dockEnabled ?? true} onChange={(dockEnabled) => update({ danmakuWindow: { ...dw, dockEnabled } })} />
        <SettingsToggle title={translate("danmakuSettings.dockIndicator")} description={translate("danmakuSettings.dockIndicatorHint")}
          checked={dw.dockIndicator ?? true} onChange={(dockIndicator) => update({ danmakuWindow: { ...dw, dockIndicator } })} />
      </SettingsGroup>
      <SettingsGroup title={translate("danmakuSettings.titleButtons")} description={translate("danmakuSettings.titleButtonsHint")}>
        <div className="settings-row-block">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {TITLE_BAR_BUTTONS.map(({ key, label, Icon }) => {
              const visible = appearance.titleBarButtons?.[key] ?? true;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={visible}
                  title={visible ? translate("danmakuSettings.hideButton", { value: label }) : translate("danmakuSettings.showButton", { value: label })}
                  onClick={() => update({ titleBarButtons: { ...appearance.titleBarButtons, [key]: !visible } })}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-[11px] transition ${
                    visible
                      ? "border-pink-500/40 bg-pink-500/10 text-ink"
                      : "border-black/10 bg-transparent text-ink-muted opacity-50 hover:opacity-80 dark:border-white/10"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${visible ? "text-pink-500" : ""}`} strokeWidth={1.7} />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </SettingsGroup>
      <SettingsGroup title={translate("danmakuSettings.messageContent")}>
        <SettingsChoice title={translate("danmakuSettings.emotes")} value={appearance.emoticonStyle} onChange={(emoticonStyle) => update({ emoticonStyle: emoticonStyle as Settings["appearance"]["emoticonStyle"] })}
          options={[{ value: "image", label: translate("danmakuSettings.image") }, { value: "text", label: translate("danmakuSettings.text") }, { value: "hidden", label: translate("danmakuSettings.hidden") }]} />
        <SettingsToggle title={translate("danmakuSettings.compactSuperChat")} description={translate("danmakuSettings.compactSuperChatHint")} checked={appearance.scInDanmaku} onChange={(scInDanmaku) => update({ scInDanmaku })} />
        <SettingsToggle
          title={translate("danmakuSettings.plainPrice")}
          description={translate("danmakuSettings.plainPriceHint")}
          checked={appearance.plainPriceMessages ?? false}
          onChange={(plainPriceMessages) => update({ plainPriceMessages })}
        />
        <details className="settings-details">
          <summary>{translate("danmakuSettings.users")}</summary>
          <SettingsToggle title={translate("danmakuSettings.showBadges")} description={translate("danmakuSettings.showBadgesHint")} checked={appearance.showMedal} onChange={(showMedal) => update({ showMedal })} />
          {HIDE_APPEARANCE_KEYS.map((key) => (
            <SettingsToggle key={key} title={translate(key === "hideUserIdColor" ? "prefs.keepLabel" : "prefs.showLabel", { label: translate(`prefs.${key}`) })}
              checked={!appearance[key]} onChange={(visible) => update({ [key]: !visible })}
              disabled={!appearance.showMedal && (key === "hideGloryLevel" || key === "hideFanMedal")} />
          ))}
          {/* 语义与上面一组相反：这里勾选 = 显示，默认开启 */}
          <SettingsToggle title={translate("danmakuSettings.bubble")}
            description={translate("danmakuSettings.bubbleHint")}
            checked={!appearance.hideBubbleColor}
            onChange={(visible) => update({ hideBubbleColor: !visible })} />
        </details>
      </SettingsGroup>
      <SettingsGroup title={translate("danmakuSettings.activity")} description={translate("danmakuSettings.activityHint")}>
        <SettingsChoice title={translate("danmakuSettings.activityMode")} value={appearance.activityBarMode}
          options={ACTIVITY_BAR_MODES.map((value) => ({ value, label: translate(`prefs.${value}`) }))}
          onChange={(activityBarMode) => update({ activityBarMode: activityBarMode as Settings["appearance"]["activityBarMode"] })} />
        <SettingsChoice title={translate("danmakuSettings.activityContent")} value={appearance.activityFilter}
          options={ACTIVITY_FILTERS.map((value) => ({ value, label: translate(`prefs.${value}`) }))}
          disabled={appearance.activityBarMode === "hidden"} description={appearance.activityBarMode === "hidden" ? translate("danmakuSettings.activityDisabled") : undefined}
          onChange={(activityFilter) => update({ activityFilter: activityFilter as Settings["appearance"]["activityFilter"] })} />
      </SettingsGroup>
      <SettingsGroup title={translate("danmakuSettings.liveInteractions")} description={translate("danmakuSettings.liveInteractionsHint")}>
        <SettingsToggle title={translate("danmakuSettings.reportEntry")}
          description={translate("danmakuSettings.reportEntryHint")}
          checked={settings.receive?.entryAction ?? false}
          onChange={(entryAction) => patchSettings({ receive: { ...settings.receive, entryAction } })} />
      </SettingsGroup>
      <BlockSettings settings={settings} patchSettings={patchSettings} />
    </>
  );
}

function BlockSettings({ settings, patchSettings }: SettingsPanelProps) {
  const { t: translate } = useDesktopTranslation("desktop");
  const [keyword, setKeyword] = useState("");
  const { blockedKeywords, blockedUsers } = settings.filter;
  const addKeyword = () => {
    const next = keyword.trim();
    if (!next) return;
    if (!blockedKeywords.includes(next)) patchSettings({ filter: { ...settings.filter, blockedKeywords: [...blockedKeywords, next] } });
    setKeyword("");
  };
  return (
    <SettingsGroup title={translate("danmakuSettings.filters")} description={translate("danmakuSettings.filtersHint")}>
      <div className="settings-row-block">
        <label htmlFor="settings-block-keyword" className="text-[13px] text-ink">{translate("danmakuSettings.keywords")}</label>
        <div className="mt-2 flex gap-2">
          <input id="settings-block-keyword" type="text" value={keyword} onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); addKeyword(); } }}
            placeholder={translate("danmakuSettings.keyword")} className="h-8 min-w-0 flex-1 px-3 text-[13px]" />
          <button type="button" className="settings-action" disabled={!keyword.trim()} onClick={addKeyword}>{translate("danmakuSettings.add")}</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {blockedKeywords.map((value) => (
            <span key={value} className="inline-flex max-w-full items-center gap-1 rounded-md bg-ink/[0.05] px-2 py-1 text-xs text-ink-muted">
              <span className="truncate" title={value}>{value}</span>
              <button type="button" aria-label={translate("danmakuSettings.removeKeyword", { value: value })} onClick={() => patchSettings({ filter: { ...settings.filter, blockedKeywords: blockedKeywords.filter((item) => item !== value) } })}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {!blockedKeywords.length && <p className="text-xs text-ink-muted">{translate("danmakuSettings.emptyKeywords")}</p>}
        </div>
      </div>
      <details className="settings-details">
        <summary>{translate("danmakuSettings.blockedUsers") + " "}{blockedUsers.length}</summary>
        {!blockedUsers.length && <p className="px-3 pb-3 text-xs text-ink-muted">{translate("danmakuSettings.blockedUsersHint")}</p>}
        {blockedUsers.map((user) => (
          <div key={user.uid} className="settings-row">
            <span className="min-w-0 truncate text-[13px] text-ink">{user.username} <span className="numeric text-xs text-ink-muted">{user.uid}</span></span>
            <button type="button" className="settings-action" aria-label={translate("danmakuSettings.unblockUser", { value: user.username })}
              onClick={() => patchSettings({ filter: { ...settings.filter, blockedUsers: blockedUsers.filter((item) => item.uid !== user.uid) } })}>{translate("danmakuSettings.unblock")}</button>
          </div>
        ))}
      </details>
    </SettingsGroup>
  );
}
