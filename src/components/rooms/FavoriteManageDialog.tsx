import { useTranslation as useDesktopTranslation } from "@/i18n";
import { useEffect, useRef } from "react";
import { Star, X } from "lucide-react";
import type { Room } from "@/types/bilibili";

interface FavoriteManageDialogProps {
  open: boolean;
  /** 收藏的直播间完整信息（按 rooms 匹配过滤，保证展示最新昵称） */
  rooms: Room[];
  onRemove: (roomId: number) => void;
  onClose: () => void;
}

/**
 * 收藏管理弹窗：列出全部收藏的直播间并支持移除。
 * 数据存本地（app_metadata），与 B 站账号无关。
 */
export function FavoriteManageDialog({ open, rooms, onRemove, onClose }: FavoriteManageDialogProps) {
  const { t: translate } = useDesktopTranslation("desktop");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        ref={dialogRef}
        className="workspace-dialog flex max-h-[70vh] w-full max-w-md flex-col rounded-lg bg-app-surface p-5 shadow-lg dark:ring-1 dark:ring-white/[0.06]"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-medium text-slate-900 dark:text-white">{translate("roomFavorites.title")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:bg-black/5 hover:text-slate-600 dark:hover:bg-white/[0.06] dark:hover:text-slate-300"
            aria-label={translate("roomFavorites.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {rooms.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            {translate("roomFavorites.empty")}
          </p>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-subtle overflow-y-auto">
            {rooms.map((room) => (
              <li key={room.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">{room.uname}</p>
                  <p className="numeric truncate text-xs text-ink-muted">{translate("roomFavorites.roomId") + " "}{room.roomId}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(room.roomId)}
                  className="workspace-button shrink-0 text-xs"
                  title={translate("roomFavorites.remove")}
                >
                  {translate("roomFavorites.remove")}
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs text-ink-muted">{translate("roomFavorites.local")}</p>
      </div>
    </div>
  );
}
