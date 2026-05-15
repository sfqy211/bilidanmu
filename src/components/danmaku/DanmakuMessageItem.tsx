import { InlineEmotText } from "@/components/danmaku/InlineEmotText";
import type { DanmakuMessage } from "@/types/danmaku";

function formatTime(ts: number): string {
  if (!ts) {
    return "";
  }

  const date = new Date(ts * 1000);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function colorToHex(color?: number): string | undefined {
  if (color == null || color === 16_777_215) {
    return undefined;
  }

  return `#${color.toString(16).padStart(6, "0")}`;
}

function getMessageCardClass(type: string): string {
  if (type === "gift") {
    return "rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2";
  }

  if (type === "entry") {
    return "rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2";
  }

  return "rounded-lg bg-slate-950/50 px-3 py-2";
}

function getMessageTextClass(type: string): string {
  if (type === "gift") {
    return "mt-1 break-words text-sm text-amber-100";
  }

  if (type === "entry") {
    return "mt-1 break-words text-sm text-slate-300";
  }

  return "mt-1 break-words text-sm";
}

function getBigEmoticonSize(emoticon?: DanmakuMessage["emoticonOptions"]) {
  if (!emoticon) {
    return { width: 162, height: 162 };
  }

  if (emoticon.emoticonUnique?.startsWith("official_")) {
    return { width: emoticon.width ?? 183, height: emoticon.height ?? 60 };
  }

  return { width: 162, height: 162 };
}

export function DanmakuMessageItem({ item }: { item: DanmakuMessage }) {
  const textColor = colorToHex(item.color);
  const bigEmoticonSize =
    item.type === "danmaku" && item.dmType === 1 && item.emoticonOptions
      ? getBigEmoticonSize(item.emoticonOptions)
      : null;

  return (
    <div className={getMessageCardClass(item.type)}>
      <div className="flex items-center gap-2 text-xs">
        {item.timestamp > 0 ? <span className="text-slate-500">{formatTime(item.timestamp)}</span> : null}
        {item.type === "gift" ? <span className="text-amber-300">🎁</span> : null}
        {item.type === "entry" ? <span className="text-slate-400">↪</span> : null}
        <span className="font-medium text-pink-300">{item.username}</span>
        {item.medal ? <span className="text-cyan-300">[{item.medal}]</span> : null}
        {item.isAdmin ? <span className="text-amber-300">房管</span> : null}
        {item.type === "gift" && item.giftName ? <span className="text-amber-200">{item.giftName}</span> : null}
      </div>
      <p
        className={getMessageTextClass(item.type)}
        style={item.type === "danmaku" && textColor ? { color: textColor } : undefined}
      >
        {item.type === "danmaku" && item.dmType === 1 && item.emoticonOptions && bigEmoticonSize ? (
          <span className="flex items-center justify-center py-1">
            <img
              src={item.emoticonOptions.url}
              alt={item.emoticonOptions.emoticonUnique}
              className="object-contain"
              style={{ width: bigEmoticonSize.width, height: bigEmoticonSize.height }}
            />
          </span>
        ) : item.type === "danmaku" ? (
          <InlineEmotText content={item.content} emots={item.emots} />
        ) : (
          item.content
        )}
      </p>
    </div>
  );
}
