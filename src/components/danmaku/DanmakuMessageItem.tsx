import { useCallback, useEffect, useRef, useState } from "react";
import { AtSign, Copy, ExternalLink, ShieldBan, User } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { InlineEmotText } from "@/components/danmaku/InlineEmotText";
import { MedalBadge } from "@/components/danmaku/MedalBadge";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import type { DanmakuMessage } from "@/types/danmaku";
import { useDanmakuStore } from "@/stores/danmaku-store";
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

function ContextMenu({
  item,
  x,
  y,
  onClose,
  onMention,
}: {
  item: DanmakuMessage;
  x: number;
  y: number;
  onClose: () => void;
  onMention?: (username: string) => void;
}) {
  const menuNodeRef = useRef<HTMLDivElement | null>(null);

  // 使用回调 ref 在元素挂载时立即调整位置，避免闪烁
  const adjustPosition = useCallback((node: HTMLDivElement | null) => {
    menuNodeRef.current = node;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const adjustedX = Math.max(8, Math.min(x, viewportWidth - rect.width - 8));
    const adjustedY = Math.max(8, Math.min(y, viewportHeight - rect.height - 8));
    node.style.left = `${adjustedX}px`;
    node.style.top = `${adjustedY}px`;
    node.style.visibility = "visible";
  }, [x, y]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuNodeRef.current && !menuNodeRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    onClose();
  }, [onClose]);

  const openHomepage = useCallback(() => {
    if (item.uid) {
      void openUrl(`https://space.bilibili.com/${item.uid}`);
    }
    onClose();
  }, [item.uid, onClose]);

  const handleBlockUser = useCallback(() => {
    if (!item.uid) return;
    const patchSettings = useSettingsStore.getState().patchSettings;
    const currentFilter = useSettingsStore.getState().settings.filter;
    // 避免重复添加
    if (currentFilter.blockedUsers.some((u) => u.uid === item.uid)) {
      onClose();
      return;
    }
    const newUser = { uid: item.uid, username: item.username };
    const newBlockedUsers = [...currentFilter.blockedUsers, newUser];
    patchSettings({
      filter: { ...currentFilter, blockedUsers: newBlockedUsers }
    });
    // 立即生效：同步 danmaku store
    useDanmakuStore.getState().setBlockFilter(newBlockedUsers, currentFilter.blockedKeywords);
    // 持久化到本地
    void useSettingsStore.getState().saveSettings();
    onClose();
  }, [item.uid, item.username, onClose]);

  const handleMention = useCallback(() => {
    if (onMention) {
      onMention(item.username);
    }
    onClose();
  }, [item.username, onMention, onClose]);

  return (
    <div
      ref={adjustPosition}
      className="fixed z-50 min-w-[140px] overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-white/[0.06] dark:bg-[#12141e]"
      style={{ left: x, top: y, visibility: "hidden" }}
    >
      {onMention && item.type === "danmaku" && (
        <button
          type="button"
          onClick={handleMention}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-white/[0.04]"
        >
          <AtSign className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-slate-700 dark:text-slate-200">@{item.username}</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => void copyToClipboard(item.username)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-white/[0.04]"
      >
        <User className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-slate-700 dark:text-slate-200">复制昵称</span>
      </button>
      {item.content && (
        <button
          type="button"
          onClick={() => void copyToClipboard(item.content)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-white/[0.04]"
        >
          <Copy className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-slate-700 dark:text-slate-200">复制内容</span>
        </button>
      )}
      {item.uid !== undefined && item.uid > 0 && (
        <>
          <button
            type="button"
            onClick={handleBlockUser}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-white/[0.04]"
          >
            <ShieldBan className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-700 dark:text-slate-200">屏蔽此用户</span>
          </button>
          <button
            type="button"
            onClick={openHomepage}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-white/[0.04]"
          >
            <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-700 dark:text-slate-200">打开主页</span>
          </button>
        </>
      )}
    </div>
  );
}

export function DanmakuMessageItem({
  item,
  fontSize = 14,
  cachedEmotUrls,
  onMention,
}: {
  item: DanmakuMessage;
  fontSize?: number;
  cachedEmotUrls?: Set<string>;
  /** @回复回调，传入用户名 */
  onMention?: (username: string) => void;
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

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div className="mb-2 block select-none leading-6 pointer-events-none">
      <span className="pointer-events-auto" onContextMenu={handleContextMenu}>
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
      {item.replyUsername && (
        <span className="mr-1 text-xs text-slate-400 dark:text-slate-500">
          回复 @{item.replyUsername}
        </span>
      )}
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
      </span>
      {contextMenu && (
        <ContextMenu
          item={item}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onMention={onMention}
        />
      )}
    </div>
  );
}
