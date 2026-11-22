import { useTranslation as useDesktopTranslation, i18n as desktopI18n } from "@/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Settings2, Star } from "lucide-react";
import {
  PanelButton,
  PanelEmpty,
  PanelIconButton,
  PanelNote,
} from "@/components/ui/DanmakuPanel";
import { FloatingPanel } from "@/components/danmaku/FloatingPanel";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import type { Emoticon, EmoticonPackage } from "@/types/bilibili";
import { makePkgKey } from "@/types/bilibili";

function getPackageLabel(pkg: EmoticonPackage): string {
  return pkg.pkgName || desktopI18n.t("desktop:emotes.unnamedPack", { value: pkg.pkgId });
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
  return desktopI18n.t("desktop:emotes.title");
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
  favoriteUniques,
  onClose,
  onReload,
  onSelectPackage,
  onSelectEmoticon,
  onToggleFavorite,
}: {
  roomId: number;
  accountId?: string | null;
  loading: boolean;
  error: string | null;
  packages: EmoticonPackage[];
  activePkgKey: string | null;
  sending: boolean;
  favoriteUniques?: Set<string>;
  onClose: () => void;
  onReload: () => void;
  onSelectPackage: (pkgKey: string) => void;
  onSelectEmoticon: (emoticon: Emoticon) => void;
  onToggleFavorite?: (emoticon: Emoticon) => void;
}) {
  const { t: translate } = useDesktopTranslation("desktop");
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
    <FloatingPanel title={translate("emotes.picker")} onClose={() => { setManaging(false); onClose(); }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <PanelNote>{managing ? translate("emotes.manageHint") : translate("emotes.sendHint")}</PanelNote>
        <PanelIconButton
          label={managing ? translate("emotes.finish") : translate("emotes.manage")}
          active={managing}
          onClick={() => setManaging((v) => !v)}
        >
          <Settings2 className="h-4 w-4" />
        </PanelIconButton>
      </div>

      {loading ? (
        <PanelEmpty>{translate("emotes.loading")}</PanelEmpty>
      ) : error ? (
        <div className="space-y-2">
          <p className="panel-error">{error}</p>
          <PanelButton onClick={onReload}>{translate("emotes.retry")}</PanelButton>
        </div>
      ) : packages.length === 0 ? (
        <PanelEmpty>{translate("emotes.empty")}</PanelEmpty>
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
                      if (pkg.pkgId !== -1) handleToggle(pkg);
                    } else {
                      onSelectPackage(makePkgKey(pkg));
                    }
                  }}
                  title={managing ? (pkgHidden ? translate("emotes.show", { value: getPackageLabel(pkg) }) : translate("emotes.hide", { value: getPackageLabel(pkg) })) : getPackageLabel(pkg)}
                  className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition ${
                    managing
                      ? pkgHidden
                        ? "bg-[var(--panel-control-bg)] opacity-50"
                        : "bg-[var(--panel-control-bg)] ring-1 ring-inset ring-brand/30"
                      : active
                        ? "bg-brand/10 text-brand ring-1 ring-inset ring-brand/30"
                        : "bg-[var(--panel-control-bg)] text-ink-muted hover:bg-[var(--panel-hover)]"
                  }`}
                >
                  {pkg.pkgId === -1 ? (
                    <Star className={`h-5 w-5 ${active ? "fill-amber-400 text-amber-400" : "text-amber-400"}`} />
                  ) : preview ? (
                    <ProxiedImage
                      src={preview.url}
                      alt={getPackageLabel(pkg)}
                      persistent
                      className={`h-7 w-7 object-contain ${pkgHidden ? "grayscale" : ""}`}
                    />
                  ) : (
                    <span className="text-[10px]">{translate("emotes.pack")}</span>
                  )}
                  {managing && (
                    <span className="absolute -right-1 -top-1 rounded-full bg-[var(--panel-control-bg)] p-0.5 shadow-sm">
                      {pkgHidden ? (
                        <EyeOff className="h-3 w-3 text-ink-muted" />
                      ) : (
                        <Eye className="h-3 w-3 text-brand" />
                      )}
                    </span>
                  )}
                </button>
              );
            })}
            </div>
          </div>

          {!managing && (
            <div className="grid grid-cols-5 gap-px">
              {activePackage?.pkgId === -1 && (activePackage.emoticons.length === 0) ? (
                <div className="col-span-4 flex h-full items-center justify-center text-xs text-ink-muted">
                  {translate("emotes.favoriteHint")}
                </div>
              ) : activePackage?.emoticons.map((emoticon, index) => {
                const available = (emoticon.perm ?? 1) !== 0 && Boolean(emoticon.emoticonUnique);
                const isFav = favoriteUniques?.has(emoticon.emoticonUnique ?? "") ?? false;
                const isFavPkg = activePackage?.pkgId === -1;
                return (
                  <div
                    key={`${activePackage.pkgId}-${emoticon.emoticonUnique ?? emoticon.emoticonId ?? index}`}
                    className="relative"
                  >
                    <button
                      type="button"
                      disabled={!available || sending}
                      onClick={() => onSelectEmoticon(emoticon)}
                      title={emoticon.descript ?? emoticon.emoji ?? translate("emotes.title")}
                      className={`flex h-full w-full flex-col items-center rounded-md p-1 text-center transition ${
                        available
                          ? "bg-[var(--panel-control-bg)] hover:bg-[var(--panel-hover)]"
                          : "cursor-not-allowed bg-[var(--panel-control-bg)] opacity-50"
                      }`}
                    >
                      <ProxiedImage
                        src={emoticon.url}
                        alt={getEmoticonLabel(emoticon)}
                        persistent
                        className="h-10 w-10 object-contain"
                      />
                      <span className="mt-1 line-clamp-2 text-[10.5px] text-ink-muted">
                        {getEmoticonLabel(emoticon)}
                      </span>
                    </button>
                    {onToggleFavorite && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onToggleFavorite(emoticon); }}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full transition hover:bg-[var(--panel-hover)]"
                        title={isFav ? translate("emotes.unfavorite") : translate("emotes.favorite")}
                      >
                        <Star
                          className={`h-3 w-3 ${isFav ? "fill-amber-400 text-amber-400" : "text-ink-muted/60"}`}
                        />
                      </button>
                    )}
                  </div>
                );
              })
            }
            </div>
          )}
        </>
      )}
    </FloatingPanel>
  );
}
