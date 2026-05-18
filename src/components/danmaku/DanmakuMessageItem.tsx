import { InlineEmotText } from "@/components/danmaku/InlineEmotText";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import type { DanmakuMessage } from "@/types/danmaku";

function getMessageTextClass(type: string): string {
  if (type === "gift") {
    return "break-words text-sm text-amber-700 dark:text-amber-100";
  }

  if (type === "entry") {
    return "break-words text-sm text-slate-500 dark:text-slate-300";
  }

  return "break-words text-sm text-[#1d1d1f] dark:text-[#ffffff]";
}

function getGuardUsernameClass(guardLevel?: number): string {
  switch (guardLevel) {
    case 1: // 总督 Governor
      return "text-[#F77102] dark:text-[#FEBF8B]";
    case 2: // 提督 Admiral
      return "text-[#AA3CDD] dark:text-[#CA86EA]";
    case 3: // 舰长 Captain
      return "text-[#006FE6] dark:text-[#80BDFF]";
    default:
      return "text-[#1d1d1f] dark:text-[#ffffff]";
  }
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
  const bigEmoticonSize =
    item.type === "danmaku" && item.dmType === 1 && item.emoticonOptions
      ? getBigEmoticonSize(item.emoticonOptions)
      : null;

  return (
    <div className="text-sm leading-6">
      {item.medal ? <span className="mr-2 text-xs text-cyan-600 dark:text-cyan-300">[{item.medal}]</span> : null}
      {item.type === "entry" ? <span className="mr-1 text-slate-400">↪</span> : null}
      <span
        className={`mr-1 font-bold ${getGuardUsernameClass(item.guardLevel)}`}
      >
        {item.username}
      </span>
      {item.isAdmin ? <span className="mr-1 text-xs text-amber-600 dark:text-amber-300">房管</span> : null}
      {item.type === "gift" && item.price ? <span className="mr-1 text-amber-600 dark:text-amber-200">¥{(item.price / 1000).toFixed(2)}</span> : null}
      <span
        className={getMessageTextClass(item.type)}
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
