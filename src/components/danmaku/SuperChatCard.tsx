import { MedalBadge } from "@/components/danmaku/MedalBadge";
import type { DanmakuMessage } from "@/types/danmaku";
import { useSettingsStore } from "@/stores/settings-store";

function normalizeHexColor(color?: string, fallback?: string): string | undefined {
  if (!color) return fallback;
  return color.startsWith("#") ? color : `#${color}`;
}

function formatTime(ts: number): string {
  if (!ts) return "";
  const date = new Date(ts * 1000);
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function SuperChatCard({ item }: { item: DanmakuMessage }) {
  const showMedal = useSettingsStore((state) => state.settings.appearance.showMedal);
  const hideFanMedal = useSettingsStore((state) => state.settings.appearance.hideFanMedal);
  const headerBg = normalizeHexColor(item.backgroundColor, "#EDF5FF");
  const bottomBg = normalizeHexColor(item.backgroundBottomColor, "#2A60B2");
  const priceColor = normalizeHexColor(item.backgroundPriceColor, "#7497CD");
  const messageColor = normalizeHexColor(item.messageFontColor, "#FFFFFF");

  return (
    <div className="shrink-0 overflow-hidden rounded">
      <div
        className="flex items-center gap-2 px-2.5 py-1.5"
        style={{ backgroundColor: headerBg }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
          {item.medal && showMedal && !hideFanMedal ? <MedalBadge medal={item.medal} /> : null}
          <span className="truncate font-medium text-slate-800">{item.username}</span>
          {item.timestamp > 0 ? <span className="shrink-0 text-slate-400">{formatTime(item.timestamp)}</span> : null}
        </div>
        {item.price ? (
          <span className="shrink-0 text-xs font-semibold" style={{ color: priceColor }}>
            ¥{item.price}
          </span>
        ) : null}
      </div>
      {item.content && (
        <div
          className="px-2.5 py-1.5 text-sm"
          style={{ backgroundColor: bottomBg, color: messageColor }}
        >
          {item.content}
        </div>
      )}
    </div>
  );
}
