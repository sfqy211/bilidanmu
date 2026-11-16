import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ListVideo, LogOut, X } from "lucide-react";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { useRoomStore } from "@/stores/room-store";
import { useSettingsStore } from "@/stores/settings-store";
import { tauriCommands } from "@/lib/tauri";

const appWindow = getCurrentWindow();

/** getRoomsLiveStatus 按 UID 键控（get_status_info_by_uids），不是房间号 */
type LiveStatusMap = Record<string, { isLive: boolean; title: string }>;

/**
 * 弹幕窗口默认页：未选择直播间时的引导界面。
 * 启动即弹幕窗模式（设置 startupView = danmaku）下首次展示，列出已保存直播间，
 * 点击经 switch_room 进入（room-switched 事件驱动切路由）；右上角退出回主页面。
 */
export function DanmakuDefaultPage() {
  const navigate = useNavigate();
  const rooms = useRoomStore((state) => state.rooms);
  const opacity = useSettingsStore((state) => state.settings.appearance.opacity);
  const [liveStatus, setLiveStatus] = useState<LiveStatusMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entering, setEntering] = useState<number | null>(null);

  const refreshStatus = useCallback(() => {
    tauriCommands.room
      .getRoomsLiveStatus()
      .then((status) => setLiveStatus(status))
      .catch(() => setLiveStatus(null));
  }, []);

  // 首次拉取 + 跟随后台 60s 开播状态轮询（rooms-updated 同时也会刷新房间列表）
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);
  useTauriEvent("rooms-updated", refreshStatus);

  // 托盘/MCP 等入口切房间：本页监听并切路由（DanmakuPage 的监听只挂在房间路由上）
  useTauriEvent<number>("room-switched", (payload) => {
    navigate(`/danmaku/${payload}`);
  });

  // 开播中的排前面，其余保持存储顺序
  const sortedRooms = useMemo(() => {
    const isLive = (uid: number | null | undefined) =>
      uid != null && liveStatus?.[String(uid)]?.isLive === true;
    return [...rooms].sort((a, b) => Number(isLive(b.uid)) - Number(isLive(a.uid)));
  }, [rooms, liveStatus]);

  const enterRoom = useCallback(async (targetRoomId: number) => {
    setError(null);
    setEntering(targetRoomId);
    try {
      // 成功后由 room-switched 事件驱动切路由，这里只负责兜住失败
      await tauriCommands.room.switchRoom(targetRoomId);
    } catch (err) {
      setError(`进入直播间失败：${String(err)}`);
    } finally {
      setEntering(null);
    }
  }, []);

  // 回到主页面：销毁弹幕窗并显示主窗口（不动 currentRoomId，下次启动仍可恢复）
  const exitToMain = useCallback(() => {
    tauriCommands.room.closeDanmakuWindow().catch(() => {
      // 命令失败时兜底本地销毁，避免窗口残留
      appWindow.destroy().catch(() => {});
    });
  }, []);

  const handleTitleBarMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.button === 0) void appWindow.startDragging();
  }, []);

  const bgAlpha = opacity / 100;

  return (
    <main
      className="danmaku-bg-main window-rounded flex h-full flex-col overflow-hidden select-none text-ink"
      style={{ "--bg-a": bgAlpha } as React.CSSProperties}
    >
      {/* 标题栏 */}
      <div
        data-interactive=""
        className="danmaku-bg-bar flex select-none items-center pl-3"
        onMouseDown={handleTitleBarMouseDown}
      >
        <span className="flex-1 truncate text-sm text-ink-muted">弹幕窗口</span>
        <button
          type="button"
          onClick={() => appWindow.close()}
          className="flex h-6 w-6 items-center justify-center text-ink-muted transition hover:bg-[#ebebeb] dark:hover:bg-white/[0.06]"
          title="隐藏到托盘"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={exitToMain}
          className="flex h-6 w-6 items-center justify-center text-ink-muted transition hover:bg-rose-500 hover:text-white dark:hover:bg-rose-500"
          title="回到主页面"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 内容区：已保存直播间列表 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 pb-2.5">
        {rooms.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <ListVideo className="h-8 w-8 text-ink-muted opacity-50" />
            <p className="text-sm text-ink-muted">还没有添加直播间</p>
            <button
              type="button"
              onClick={exitToMain}
              className="rounded-md px-3 py-1.5 text-xs text-brand transition hover:bg-brand/10"
            >
              打开主页面添加
            </button>
          </div>
        ) : (
          <>
            <p className="px-1.5 pb-1.5 pt-1 text-[11px] text-ink-muted">
              选择一个直播间进入 · 直播中的排在最前
            </p>
            <div className="space-y-0.5">
              {sortedRooms.map((room) => {
                const live = room.uid != null && liveStatus?.[String(room.uid)]?.isLive === true;
                const liveTitle = room.uid != null ? liveStatus?.[String(room.uid)]?.title?.trim() ?? "" : "";
                const displayTitle = liveTitle || room.title;
                return (
                  <button
                    key={room.roomId}
                    type="button"
                    onClick={() => void enterRoom(room.roomId)}
                    disabled={entering !== null}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition hover:bg-black/5 disabled:cursor-wait disabled:opacity-60 dark:hover:bg-white/[0.06]"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        live ? "bg-rose-500" : "bg-slate-300 dark:bg-slate-600"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{room.uname}</span>
                      {displayTitle && (
                        <span className="block truncate text-[11px] text-ink-muted">
                          {displayTitle}
                        </span>
                      )}
                    </span>
                    {live && (
                      <span className="shrink-0 text-[10px] font-medium text-rose-500">直播中</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {error && <p className="px-2 pt-2 text-xs text-rose-600 dark:text-rose-300">{error}</p>}
      </div>
    </main>
  );
}
