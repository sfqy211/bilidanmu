import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ListVideo } from "lucide-react";
import { PanelIconButton, PanelListRow, PanelShell } from "@/components/ui/DanmakuPanel";
import { usePanelDismiss } from "@/hooks/usePanelDismiss";
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
  const [liveStatus, setLiveStatus] = useState<Record<
    string,
    { isLive: boolean; title: string }
  > | null>(null);
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

  usePanelDismiss({
    open,
    onClose: () => setOpen(false),
    ignoreRef: containerRef,
  });

  // 仅显示开播中的房间（保持存储顺序）；状态映射按 UID 键控（get_status_info_by_uids），不是房间号
  const liveRooms = useMemo(
    () =>
      liveStatus
        ? rooms.filter((room) => room.uid != null && liveStatus[String(room.uid)]?.isLive === true)
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
      <PanelIconButton
        label="切换直播间"
        active={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ListVideo className="h-3.5 w-3.5" />
      </PanelIconButton>

      {open && (
        <PanelShell
          variant="menu"
          hideHeader
          ariaLabel="切换直播间"
          maxHeight="224px"
          className="absolute right-0 top-full z-50 mt-1 w-56"
        >
          {liveStatus === null ? (
            <p className="panel-note px-2 py-1.5">
              {statusLoading ? "正在获取开播状态…" : "开播状态获取失败"}
            </p>
          ) : liveRooms.length === 0 ? (
            <p className="panel-note px-2 py-1.5">暂无正在直播的房间</p>
          ) : (
            <div className="panel-list">
              {liveRooms.map((room) => {
                const isCurrent = room.roomId === roomId;
                const liveTitle = liveStatus[String(room.uid)]?.title?.trim() ?? "";
                const displayTitle = liveTitle || room.title;
                return (
                  <PanelListRow
                    key={room.roomId}
                    label={room.uname}
                    description={displayTitle}
                    selected={isCurrent}
                    align="start"
                    right={isCurrent ? <Check className="h-3.5 w-3.5" /> : undefined}
                    onClick={() => void handleSelect(room.roomId)}
                  />
                );
              })}
            </div>
          )}
        </PanelShell>
      )}
    </div>
  );
}
