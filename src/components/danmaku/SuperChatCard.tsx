import type { DanmakuMessage } from "@/types/danmaku";

function normalizeHexColor(color?: string, fallback?: string): string | undefined {
  if (!color) {
    return fallback;
  }

  if (color.startsWith("#")) {
    return color;
  }

  return `#${color}`;
}

function formatTime(ts: number): string {
  if (!ts) {
    return "";
  }

  const date = new Date(ts * 1000);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function SuperChatCard({ item }: { item: DanmakuMessage }) {
  const headerBg = normalizeHexColor(item.backgroundColor, "#EDF5FF");
  const bottomBg = normalizeHexColor(item.backgroundBottomColor, "#2A60B2");
  const priceColor = normalizeHexColor(item.backgroundPriceColor, "#7497CD");
  const messageColor = normalizeHexColor(item.messageFontColor, "#FFFFFF");

  return (
    <div className="overflow-hidden">
      <div
        className="flex items-center gap-3 border-x border-t px-3 py-2"
        style={{
          backgroundColor: headerBg,
          borderColor: bottomBg,
          backgroundImage: item.backgroundImage ? `url(${item.backgroundImage})` : undefined,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "top right",
          backgroundSize: "auto 100%",
        }}
      >
        {item.avatar ? (
          <img
            src={item.avatar}
            alt={item.username}
            className="h-9 w-9 rounded-full border border-white/20 object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/30 text-slate-700">
            💬
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            {item.timestamp > 0 ? <span className="text-slate-500">{formatTime(item.timestamp)}</span> : null}
            <span className="truncate font-medium text-slate-800">{item.username}</span>
            {item.medal ? <span className="text-cyan-700">[{item.medal}]</span> : null}
          </div>
        </div>

        {item.price ? (
          <span className="text-sm font-semibold" style={{ color: priceColor }}>
            ¥{item.price}
          </span>
        ) : null}
      </div>

      <div
        className="border-x border-b px-3 py-2 text-sm"
        style={{ backgroundColor: bottomBg, borderColor: bottomBg, color: messageColor }}
      >
        {item.content}
      </div>
    </div>
  );
}
