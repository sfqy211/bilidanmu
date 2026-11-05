import { memo, type CSSProperties } from "react";
import { MedalBadge } from "@/components/danmaku/MedalBadge";
import { formatTimestamp } from "@/lib/utils";
import { resolveScAccent } from "@/lib/sc-color";
import type { DanmakuMessage } from "@/types/danmaku";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * 醒目留言单行紧凑卡片。
 *
 * 原先是两段式彩色卡片（浅色顶栏 + 一整块饱和色正文），在弹幕窗这种窄窗口里
 * 非常压场：一条 SC 就顶掉大半屏，还会盖住上下的普通弹幕。现在颜色只落在
 * 价格胶囊和正文文字上，背景交给弹幕窗本身；双语译文用「／」内联跟在原文后，
 * 没有译文时只显示原文。
 */
export const SuperChatCard = memo(function SuperChatCard({ item }: { item: DanmakuMessage }) {
  const showMedal = useSettingsStore((state) => state.settings.appearance.showMedal);
  const hideFanMedal = useSettingsStore((state) => state.settings.appearance.hideFanMedal);
  const accent = resolveScAccent(item);

  return (
    <div
      className="mb-2 block select-none break-words leading-6 pointer-events-none"
      style={{ "--sc-accent": accent } as CSSProperties}
    >
      <span className="pointer-events-auto">
        <span className="sc-chip">{item.price ? `¥${item.price}` : "SC"}</span>
        {item.medal && showMedal && !hideFanMedal ? <MedalBadge medal={item.medal} /> : null}
        <span className="mr-1 font-bold text-[#1d1d1f] dark:text-[#ffffff]">{item.username}</span>
        {item.timestamp > 0 ? (
          <span className="mr-1 text-xs text-slate-400 dark:text-slate-500">{formatTimestamp(item.timestamp)}</span>
        ) : null}
        <span className="sc-accent-text">
          {item.content}
          {item.contentTrans ? <span className="sc-accent-trans">{" ／ "}{item.contentTrans}</span> : null}
        </span>
      </span>
    </div>
  );
});
