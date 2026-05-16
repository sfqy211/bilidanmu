import { InlineEmotText } from "@/components/danmaku/InlineEmotText";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import type { DanmakuMessage } from "@/types/danmaku";

function colorToHex(color?: number): string | undefined {
  if (color == null || color === 16_777_215) {
    return undefined;
  }

  return `#${color.toString(16).padStart(6, "0")}`;
}

function getMessageTextClass(type: string): string {
  if (type === "gift") {
    return "break-words text-sm text-amber-700 dark:text-amber-100";
  }

  if (type === "entry") {
    return "break-words text-sm text-slate-500 dark:text-slate-300";
  }

  return "break-words text-sm text-slate-700 dark:text-slate-200";
}

function getBigEmoticonSize(emoticon?: DanmakuMessage["emoticonOptions"]) {
  if (!emoticon) {
    return { width: 48, height: 48 };
  }

  if (emoticon.emoticonUnique?.startsWith("official_")) {
    return {
      width: Math.min(emoticon.width ?? 48, 56),
      height: Math.min(emoticon.height ?? 48, 56),
    };
  }

  return { width: 48, height: 48 };
}

export function DanmakuMessageItem({ item }: { item: DanmakuMessage }) {
  const textColor = colorToHex(item.color);
  const bigEmoticonSize =
    item.type === "danmaku" && item.dmType === 1 && item.emoticonOptions
      ? getBigEmoticonSize(item.emoticonOptions)
      : null;

  return (
    <div className="text-sm leading-6">
      {item.medal ? <span className="mr-2 text-xs text-cyan-600 dark:text-cyan-300">[{item.medal}]</span> : null}
      {item.type === "gift" ? <span className="mr-1 text-amber-500 dark:text-amber-300">🎁</span> : null}
      {item.type === "entry" ? <span className="mr-1 text-slate-400">↪</span> : null}
      <span className="mr-1 font-medium text-pink-600 dark:text-pink-300">{item.username}</span>
      {item.isAdmin ? <span className="mr-1 text-xs text-amber-600 dark:text-amber-300">房管</span> : null}
      {item.type === "gift" && item.giftName ? <span className="mr-1 text-amber-600 dark:text-amber-200">{item.giftName}</span> : null}
      <span
        className={getMessageTextClass(item.type)}
        style={item.type === "danmaku" && textColor ? { color: textColor } : undefined}
      >
        {item.type === "danmaku" && item.dmType === 1 && item.emoticonOptions && bigEmoticonSize ? (
          <span className="inline-flex items-center align-middle">
            <ProxiedImage
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
      </span>
    </div>
  );
}
