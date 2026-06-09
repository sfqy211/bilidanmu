import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Settings2, X } from "lucide-react";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import type { Emoticon, EmoticonPackage } from "@/types/bilibili";
import { makePkgKey } from "@/types/bilibili";

function getPackageLabel(pkg: EmoticonPackage): string {
  return pkg.pkgName || `表情包 ${pkg.pkgId}`;
}

function getPackageSortPriority(pkgType?: number): number {
  switch (pkgType) {
    case 0: case 1: return 0;  // 系统表情、emoji
    case 2: case 3: return 1;  // 房间专属、UP主大表情
    default: return 2;          // 装扮表情
  }
}

/** 房间专属/UP主大表情（pkg_type 2/3）需要按房间存储 */
function isRoomSpecific(pkgType?: number): boolean {
  return pkgType === 2 || pkgType === 3;
}

function getEmoticonLabel(emoticon: Emoticon): string {
  if (emoticon.descript) return emoticon.descript;
  if (emoticon.emoji) return emoticon.emoji;
  if (emoticon.emoticonUnique) {
    const parts = emoticon.emoticonUnique.split("_");
    const last = parts[parts.length - 1];
    if (last && last.length > 1) return last;
  }
  return "表情";
}

const HIDDEN_ROOM_PREFIX = "emoticon_hidden_room_";
const HIDDEN_GLOBAL_KEY = "emoticon_hidden_global";

function hiddenKey(roomId: number, accountId?: string | null): string {
  const suffix = accountId ? `_${accountId}` : "";
  return roomId ? `${HIDDEN_ROOM_PREFIX}${roomId}${suffix}` : `${HIDDEN_GLOBAL_KEY}${suffix}`;
}

function loadHiddenPkgIds(roomId: number, accountId?: string | null): { global: Set<number>; room: Set<number> } {
  try {
    const globalRaw = localStorage.getItem(hiddenKey(0, accountId));
    const global = new Set<number>(globalRaw ? (JSON.parse(globalRaw) as number[]) : []);

    const roomRaw = localStorage.getItem(hiddenKey(roomId, accountId));
    const room = new Set<number>(roomRaw ? (JSON.parse(roomRaw) as number[]) : []);

    return { global, room };
  } catch {
    return { global: new Set(), room: new Set() };
  }
}

function toggleHiddenPkg(
  pkgId: number,
  roomSpecific: boolean,
  roomId: number,
  accountId: string | undefined | null,
  hidden: { global: Set<number>; room: Set<number> },
): { global: Set<number>; room: Set<number> } {
  if (roomSpecific) {
    const key = hiddenKey(roomId, accountId);
    const next = new Set(hidden.room);
    if (next.has(pkgId)) next.delete(pkgId);
    else next.add(pkgId);
    localStorage.setItem(key, JSON.stringify([...next]));
    return { ...hidden, room: next };
  } else {
    const key = hiddenKey(0, accountId);
    const next = new Set(hidden.global);
    if (next.has(pkgId)) next.delete(pkgId);
    else next.add(pkgId);
    localStorage.setItem(key, JSON.stringify([...next]));
    return { ...hidden, global: next };
  }
}

function isPkgHidden(
  pkg: EmoticonPackage,
  roomId: number,
  hidden: { global: Set<number>; room: Set<number> },
): boolean {
  if (isRoomSpecific(pkg.pkgType)) {
    return hidden.room.has(pkg.pkgId);
  }
  return hidden.global.has(pkg.pkgId);
}

export function EmoticonPickerPanel({
  roomId,
  accountId,
  loading,
  error,
  packages,
  activePkgKey,
  sending,
  onClose,
  onReload,
  onSelectPackage,
  onSelectEmoticon,
  className,
}: {
  roomId: number;
  accountId?: string | null;
  loading: boolean;
  error: string | null;
  packages: EmoticonPackage[];
  activePkgKey: string | null;
  sending: boolean;
  onClose: () => void;
  onReload: () => void;
  onSelectPackage: (pkgKey: string) => void;
  onSelectEmoticon: (emoticon: Emoticon) => void;
  className?: string;
}) {
  const [managing, setManaging] = useState(false);
  const [hidden, setHidden] = useState<{ global: Set<number>; room: Set<number> }>(
    () => loadHiddenPkgIds(roomId, accountId),
  );

  // 账号变化时重新加载隐藏状态
  useEffect(() => {
    setHidden(loadHiddenPkgIds(roomId, accountId));
  }, [roomId, accountId]);

  const handleToggle = useCallback((pkg: EmoticonPackage) => {
    setHidden((prev) => toggleHiddenPkg(pkg.pkgId, isRoomSpecific(pkg.pkgType), roomId, accountId, prev));
  }, [roomId, accountId]);

  const sortedPackages = useMemo(
    () => [...packages].sort((a, b) => getPackageSortPriority(a.pkgType) - getPackageSortPriority(b.pkgType)),
    [packages]
  );

  const visiblePackages = useMemo(
    () => sortedPackages.filter((pkg) => !isPkgHidden(pkg, roomId, hidden)),
    [sortedPackages, roomId, hidden]
  );

  const activePackage = visiblePackages.find((pkg) => makePkgKey(pkg) === activePkgKey) ?? visiblePackages[0];
  const activeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeBtnRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activePkgKey]);

  const displayPackages = managing ? sortedPackages : visiblePackages;

  return (
    <div
      onMouseDown={(event) => event.stopPropagation()}
      className={`${className ?? ""} danmaku-bg-panel p-3`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white">表情选择器</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {managing ? "点击表情包切换显示/隐藏" : "点击大表情后直接发送"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setManaging((v) => !v)}
            className={`p-1 transition ${
              managing
                ? "text-pink-500 bg-pink-50 dark:bg-pink-500/10"
                : "text-slate-400 hover:bg-white/[0.08] hover:text-slate-700 dark:hover:bg-white/[0.04] dark:hover:text-white"
            }`}
            title={managing ? "完成管理" : "管理表情包"}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setManaging(false);
              onClose();
            }}
            className="p-1 text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-700 dark:hover:bg-white/[0.04] dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
          正在加载表情列表...
        </div>
      ) : error ? (
        <div className="bg-rose-50 px-3 py-4 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
          <p>{error}</p>
          <button type="button" onClick={onReload} className="mt-2 text-xs text-pink-500 hover:text-pink-400 dark:text-pink-300 dark:hover:text-pink-200">
            重新加载
          </button>
        </div>
      ) : packages.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
          当前房间没有可用表情。
        </div>
      ) : (
        <>
          <div className="mb-3 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2">
            {displayPackages.map((pkg, index) => {
              const active = !managing && pkg === activePackage;
              const pkgHidden = isPkgHidden(pkg, roomId, hidden);
              const preview = pkg.emoticons[0];
              return (
                <button
                  key={`${pkg.pkgId}-${pkg.pkgType ?? 0}-${index}`}
                  ref={active ? activeBtnRef : undefined}
                  type="button"
                  onClick={() => {
                    if (managing) {
                      handleToggle(pkg);
                    } else {
                      onSelectPackage(makePkgKey(pkg));
                    }
                  }}
                  title={managing ? (pkgHidden ? `显示 ${getPackageLabel(pkg)}` : `隐藏 ${getPackageLabel(pkg)}`) : getPackageLabel(pkg)}
                  className={`relative flex h-12 w-12 shrink-0 items-center justify-center transition ${
                    managing
                      ? pkgHidden
                        ? "bg-white/10 opacity-50 dark:bg-white/[0.06]"
                        : "border border-pink-300 bg-white/10 dark:border-pink-500/40 dark:bg-white/[0.06]"
                      : active
                        ? "border border-pink-300 bg-pink-50 text-pink-600 dark:border-pink-500/40 dark:bg-pink-500/[0.08] dark:text-pink-200"
                        : "bg-white/10 text-slate-400 hover:bg-white/[0.08] dark:bg-white/[0.06] dark:text-slate-400 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  {preview ? (
                    <ProxiedImage
                      src={preview.url}
                      alt={getPackageLabel(pkg)}
                      persistent
                      className={`h-8 w-8 object-contain ${pkgHidden ? "grayscale" : ""}`}
                    />
                  ) : (
                    <span className="text-[10px]">包</span>
                  )}
                  {managing && (
                    <span className="absolute -right-1 -top-1 rounded-full bg-white/80 p-0.5 shadow-sm dark:bg-white/[0.12]">
                      {pkgHidden ? (
                        <EyeOff className="h-3 w-3 text-slate-400" />
                      ) : (
                        <Eye className="h-3 w-3 text-pink-500" />
                      )}
                    </span>
                  )}
                </button>
              );
            })}
            </div>
          </div>

          {!managing && (
            <div className="grid h-[208px] grid-cols-4 gap-2 overflow-y-auto">
              {activePackage?.emoticons.map((emoticon, index) => {
                const available = (emoticon.perm ?? 1) !== 0 && Boolean(emoticon.emoticonUnique);
                return (
                  <button
                    key={`${activePackage.pkgId}-${emoticon.emoticonUnique ?? emoticon.emoticonId ?? index}`}
                    type="button"
                    disabled={!available || sending}
                    onClick={() => onSelectEmoticon(emoticon)}
                    title={emoticon.descript ?? emoticon.emoji ?? "表情"}
                    className={`flex flex-col items-center p-2 text-center transition ${
                      available
                        ? "bg-white/10 hover:bg-white/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.04]"
                        : "cursor-not-allowed bg-white/10 opacity-50 dark:bg-white/[0.06]"
                    }`}
                  >
                    <ProxiedImage
                      src={emoticon.url}
                      alt={getEmoticonLabel(emoticon)}
                      persistent
                      className="h-12 w-12 object-contain"
                    />
                    <span className="mt-2 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-300">
                      {getEmoticonLabel(emoticon)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
