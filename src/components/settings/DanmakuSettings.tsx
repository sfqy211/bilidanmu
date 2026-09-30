import { useState } from "react";
import { X } from "lucide-react";
import { ACTIVITY_BAR_MODE_OPTIONS, ACTIVITY_FILTER_OPTIONS, HIDE_APPEARANCE_OPTIONS } from "./constants";
import { SettingsChoice, SettingsGroup, SettingsRange, SettingsToggle, type SettingsPanelProps } from "./SettingsControls";
import type { Settings } from "@/types/bilibili";

export function DanmakuSettings({ settings, patchSettings }: SettingsPanelProps) {
  const appearance = settings.appearance;
  const update = (patch: Partial<Settings["appearance"]>) => patchSettings({ appearance: { ...appearance, ...patch } });
  return (
    <>
      <SettingsGroup title="窗口与文字">
        <SettingsRange title="弹幕字号" value={appearance.fontSize} min={10} max={32} unit="px" onChange={(fontSize) => update({ fontSize })} />
        <SettingsRange title="窗口不透明度" description="数值越低，背景越透明。" value={appearance.opacity} min={10} max={100} unit="%" onChange={(opacity) => update({ opacity })} />
        <SettingsChoice title="侧边吸附动画" value={String(appearance.dockAnimMs)} onChange={(value) => update({ dockAnimMs: Number(value) })}
          options={[{ value: "0", label: "关闭" }, { value: "120", label: "快" }, { value: "220", label: "标准" }, { value: "350", label: "慢" },
            ...([0, 120, 220, 350].includes(appearance.dockAnimMs) ? [] : [{ value: String(appearance.dockAnimMs), label: `自定义 · ${appearance.dockAnimMs} ms` }])]} />
      </SettingsGroup>
      <SettingsGroup title="消息内容">
        <SettingsChoice title="表情显示" value={appearance.emoticonStyle} onChange={(emoticonStyle) => update({ emoticonStyle: emoticonStyle as Settings["appearance"]["emoticonStyle"] })}
          options={[{ value: "image", label: "图片" }, { value: "text", label: "文字" }, { value: "hidden", label: "不显示" }]} />
        <SettingsToggle title="弹幕栏显示简化醒目留言" description="礼物栏中的完整醒目留言卡片不受影响。" checked={appearance.scInDanmaku} onChange={(scInDanmaku) => update({ scInDanmaku })} />
        <details className="settings-details">
          <summary>用户信息与徽章</summary>
          <SettingsToggle title="显示用户徽章" description="控制荣耀等级与粉丝牌的总开关。" checked={appearance.showMedal} onChange={(showMedal) => update({ showMedal })} />
          {HIDE_APPEARANCE_OPTIONS.map(({ key, label }) => (
            <SettingsToggle key={key} title={`${key === "hideUserIdColor" ? "保留" : "显示"}${label}`}
              checked={!appearance[key]} onChange={(visible) => update({ [key]: !visible })}
              disabled={!appearance.showMedal && (key === "hideGloryLevel" || key === "hideFanMedal")} />
          ))}
        </details>
      </SettingsGroup>
      <SettingsGroup title="活动栏" description="管理直播间的进场与点赞消息。">
        <SettingsChoice title="显示方式" value={appearance.activityBarMode} options={ACTIVITY_BAR_MODE_OPTIONS}
          onChange={(activityBarMode) => update({ activityBarMode: activityBarMode as Settings["appearance"]["activityBarMode"] })} />
        <SettingsChoice title="显示内容" value={appearance.activityFilter} options={ACTIVITY_FILTER_OPTIONS}
          disabled={appearance.activityBarMode === "hidden"} description={appearance.activityBarMode === "hidden" ? "先启用活动栏，再选择显示内容。" : undefined}
          onChange={(activityFilter) => update({ activityFilter: activityFilter as Settings["appearance"]["activityFilter"] })} />
      </SettingsGroup>
      <BlockSettings settings={settings} patchSettings={patchSettings} />
    </>
  );
}

function BlockSettings({ settings, patchSettings }: SettingsPanelProps) {
  const [keyword, setKeyword] = useState("");
  const { blockedKeywords, blockedUsers } = settings.filter;
  const addKeyword = () => {
    const next = keyword.trim();
    if (!next) return;
    if (!blockedKeywords.includes(next)) patchSettings({ filter: { ...settings.filter, blockedKeywords: [...blockedKeywords, next] } });
    setKeyword("");
  };
  return (
    <SettingsGroup title="屏蔽管理" description="屏蔽名单对所有直播间生效，也可以在弹幕窗口中管理。">
      <div className="settings-row-block">
        <label htmlFor="settings-block-keyword" className="text-[13px] text-ink">屏蔽关键词</label>
        <div className="mt-2 flex gap-2">
          <input id="settings-block-keyword" type="text" value={keyword} onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); addKeyword(); } }}
            placeholder="输入关键词" className="h-8 min-w-0 flex-1 px-3 text-[13px]" />
          <button type="button" className="settings-action" disabled={!keyword.trim()} onClick={addKeyword}>添加</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {blockedKeywords.map((value) => (
            <span key={value} className="inline-flex max-w-full items-center gap-1 rounded-md bg-ink/[0.05] px-2 py-1 text-xs text-ink-muted">
              <span className="truncate" title={value}>{value}</span>
              <button type="button" aria-label={`移除关键词 ${value}`} onClick={() => patchSettings({ filter: { ...settings.filter, blockedKeywords: blockedKeywords.filter((item) => item !== value) } })}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {!blockedKeywords.length && <p className="text-xs text-ink-muted">暂无屏蔽关键词</p>}
        </div>
      </div>
      <details className="settings-details">
        <summary>屏蔽用户 · {blockedUsers.length}</summary>
        {!blockedUsers.length && <p className="px-3 pb-3 text-xs text-ink-muted">在弹幕消息的右键菜单中添加屏蔽用户。</p>}
        {blockedUsers.map((user) => (
          <div key={user.uid} className="settings-row">
            <span className="min-w-0 truncate text-[13px] text-ink">{user.username} <span className="numeric text-xs text-ink-muted">{user.uid}</span></span>
            <button type="button" className="settings-action" aria-label={`解除屏蔽 ${user.username}`}
              onClick={() => patchSettings({ filter: { ...settings.filter, blockedUsers: blockedUsers.filter((item) => item.uid !== user.uid) } })}>解除屏蔽</button>
          </div>
        ))}
      </details>
    </SettingsGroup>
  );
}
