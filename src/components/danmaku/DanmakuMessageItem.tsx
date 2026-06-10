import { InlineEmotText } from "@/components/danmaku/InlineEmotText";
import { MedalBadge } from "@/components/danmaku/MedalBadge";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import type { DanmakuMessage } from "@/types/danmaku";
import { useSettingsStore } from "@/stores/settings-store";

function getMessageTextClass(type: string): string {
  if (type === "gift") {
    return "break-words text-amber-700 dark:text-amber-100";
  }

  if (type === "entry") {
    return "break-words text-slate-500 dark:text-slate-300";
  }

  return "break-words text-[#1d1d1f] dark:text-[#ffffff]";
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

function getBigEmoticonSize(emoticon?: DanmakuMessage["emoticonOptions"], scale = 1) {
  const base = { width: Math.round(48 * scale), height: Math.round(48 * scale) };
  if (!emoticon) {
    return base;
  }

  if (emoticon.emoticonUnique?.startsWith("official_")) {
    return {
      width: Math.round(Math.min(emoticon.width ?? 48, 56) * scale),
      height: Math.round(Math.min(emoticon.height ?? 48, 56) * scale),
    };
  }

  return base;
}

export function DanmakuMessageItem({
  item,
  fontSize = 14,
  cachedEmotUrls,
}: {
  item: DanmakuMessage;
  fontSize?: number;
  cachedEmotUrls?: Set<string>;
}) {
  const showMedal = useSettingsStore((state) => state.settings.appearance.showMedal);
  const hideGloryLevel = useSettingsStore((state) => state.settings.appearance.hideGloryLevel);
  const hideFanMedal = useSettingsStore((state) => state.settings.appearance.hideFanMedal);
  const hideAdminBadge = useSettingsStore((state) => state.settings.appearance.hideAdminBadge);
  const hideUserIdColor = useSettingsStore((state) => state.settings.appearance.hideUserIdColor);
  const scale = fontSize / 14;
  const bigEmoticonSize =
    item.type === "danmaku" && item.dmType === 1 && item.emoticonOptions
      ? getBigEmoticonSize(item.emoticonOptions, scale)
      : null;

  // 大表情是否在已加载的表情包中（优先本地缓存）
  const bigEmotPersistent =
    bigEmoticonSize && item.emoticonOptions?.url
      ? cachedEmotUrls?.has(item.emoticonOptions.url) ?? false
      : false;

  return (
    <div className="leading-6">
      {item.isAdmin && !hideAdminBadge ? (
        <span
          className="mr-1 inline-flex h-[16px] w-[16px] items-center justify-center rounded-full border border-amber-500 text-amber-600 align-middle dark:border-amber-400 dark:text-amber-300"
          style={{ fontSize: Math.round(10 * scale), lineHeight: 1 }}
        >
          房
        </span>
      ) : null}
      {item.wealthLevel && showMedal && !hideGloryLevel ? (
        <ProxiedImage
          src={`wealth-level://${item.wealthLevel}`}
          persistent
          className="mr-1 inline-block w-auto align-middle"
          style={{ height: Math.round(18 * scale) }}
        />
      ) : null}
      {item.medal && showMedal && !hideFanMedal ? <MedalBadge medal={item.medal} scale={scale} /> : null}
      {item.type === "entry" ? <span className="mr-1 text-slate-400">↪</span> : null}
      <span
        className={`mr-1 font-bold ${hideUserIdColor ? "" : getGuardUsernameClass(item.guardLevel)}`}
      >
        {item.username}
      </span>
      {item.type === "gift" && item.price ? <span className="mr-1 text-amber-600 dark:text-amber-200">¥{(item.price / 1000).toFixed(2)}</span> : null}
      <span
        className={getMessageTextClass(item.type)}
      >
        {item.type === "danmaku" && item.dmType === 1 && item.emoticonOptions && bigEmoticonSize ? (
          <span className="inline-flex items-center align-middle">
            <ProxiedImage
              src={item.emoticonOptions.url}
              alt={item.emoticonOptions.emoticonUnique}
              persistent={bigEmotPersistent}
              className="object-contain"
              style={{ width: bigEmoticonSize.width, height: bigEmoticonSize.height }}
            />
          </span>
        ) : item.type === "danmaku" ? (
          <InlineEmotText content={item.content} emots={item.emots} cachedEmotUrls={cachedEmotUrls} />
        ) : (
          item.content
        )}
      </span>
    </div>
  );
}
