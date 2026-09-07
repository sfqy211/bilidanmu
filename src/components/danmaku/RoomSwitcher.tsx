import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ListVideo } from "lucide-react";
import { useRoomStore } from "@/stores/room-store";
import { tauriCommands } from "@/lib/tauri";

interface RoomSwitcherProps {
  roomId: number | null;
}

/** 标题栏房间切换器：Popover 仅列出开播中的已保存房间，点击走 switch_room 原地切换 */
export function RoomSwitcher({ roomId }: RoomSwitcherProps) {
  const rooms = useRoomStore((state) => state.rooms);
  const [open, setOpen] = useState(false);
  // null = 未拉取/拉取失败；{} = 已拉取但无人开播
  const [liveStatus, setLiveStatus] = useState<Record<string, boolean> | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 打开时实时拉取开播状态，不做后台轮询
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatusLoading(true);
    tauriCommands.room
      .getRoomsLiveStatus()
      .then((status) => {
        if (!cancelled) setLiveStatus(status);
      })
      .catch(() => {
        if (!cancelled) setLiveStatus(null);
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // 仅显示开播中的房间（保持存储顺序）；状态映射按 UID 键控（get_status_info_by_uids），不是房间号
  const liveRooms = useMemo(
    () =>
      liveStatus
        ? rooms.filter((room) => room.uid != null && liveStatus[String(room.uid)] === true)
        : [],
    [rooms, liveStatus],
  );

  const handleSelect = useCallback(
    async (targetRoomId: number) => {
      setOpen(false);
      if (targetRoomId === roomId) return;
      try {
        // 成功后由 room-switched 事件驱动原地切路由，这里不重复导航
        await tauriCommands.room.switchRoom(targetRoomId);
      } catch (err) {
        console.error("切换直播间失败:", err);
      }
    },
    [roomId],
  );

  if (rooms.length === 0) return null;

  return (
    // 拦下 mousedown 冒泡，避免标题栏把 Popover 区域的按下当作窗口拖动
    <div ref={containerRef} className="relative" onMouseDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-6 w-6 items-center justify-center text-slate-400 transition hover:bg-[#ebebeb] dark:text-slate-500 dark:hover:bg-white/[0.06]"
        title="切换直播间"
      >
        <ListVideo className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-white/[0.06] dark:bg-[#12141e]">
          <div className="max-h-56 overflow-y-auto py-0.5">
            {liveStatus === null ? (
              <div className="px-3 py-1.5 text-xs text-slate-400 dark:text-slate-500">
                {statusLoading ? "正在获取开播状态…" : "开播状态获取失败"}
              </div>
            ) : liveRooms.length === 0 ? (
              <div className="px-3 py-1.5 text-xs text-slate-400 dark:text-slate-500">
                暂无正在直播的房间
              </div>
            ) : (
              liveRooms.map((room) => {
                const isCurrent = room.roomId === roomId;
                return (
                  <button
                    key={room.roomId}
                    type="button"
                    onClick={() => void handleSelect(room.roomId)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                      isCurrent
                        ? "bg-pink-50 dark:bg-pink-500/10"
                        : "hover:bg-slate-100 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <span
                      className={`min-w-0 flex-1 truncate ${
                        isCurrent
                          ? "font-medium text-pink-600 dark:text-pink-400"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {room.uname}
                    </span>
                    {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-pink-500" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
