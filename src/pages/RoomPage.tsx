import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutGrid, List, MonitorPlay, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { tauriCommands } from "@/lib/tauri";
import { useRoomStore } from "@/stores/room-store";
import type { Room } from "@/types/bilibili";

export function RoomPage() {
  const navigate = useNavigate();
  const { rooms, currentRoomId, viewMode, removeRoom, setCurrentRoomId, setViewMode } =
    useRoomStore();
  const [filterText, setFilterText] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // 拖拽排序用指针事件实现（mousedown/mousemove/mouseup）：WebView2 的原生文件
  // 拖放处理器会拦截 HTML5 DnD 事件（draggable/dragstart 不触发），指针事件绕开
  // 该限制。draggingId 为拖动中的房间；dragOrderIds 为拖拽预览顺序（房间 id 列表）。
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOrderIds, setDragOrderIds] = useState<string[] | null>(null);
  const dragStateRef = useRef<{
    roomId: string;
    startX: number;
    startY: number;
    active: boolean;
    baseIds: string[];
  } | null>(null);
  const dragOrderIdsRef = useRef<string[] | null>(null);

  const [liveStatusMap, setLiveStatusMap] = useState<Record<string, boolean>>({});
  const [mockEnabled, setMockEnabled] = useState(false);

  useEffect(() => {
    tauriCommands.room.isMockEnabled().then(setMockEnabled).catch(() => {});
  }, []);

  const liveCount = useMemo(
    () => rooms.filter((r) => r.uid != null && liveStatusMap[String(r.uid)]).length,
    [rooms, liveStatusMap]
  );

  const refreshLiveStatus = async () => {
    try {
      const status = await tauriCommands.room.getRoomsLiveStatus();
      setLiveStatusMap(status);
    } catch {
      // 忽略刷新失败
    }
  };

  const handleRefreshLiveStatus = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await refreshLiveStatus();
    setRefreshing(false);
  };

  // 显示顺序：sort_order 升序（默认后添加在前），直播中优先分组、组内顺序稳定
  const displayRooms = useMemo(() => {
    const isLive = (r: Room) => r.uid != null && Boolean(liveStatusMap[String(r.uid)]);
    const ordered = [...rooms].sort((a, b) => a.sortOrder - b.sortOrder);
    return [...ordered.filter(isLive), ...ordered.filter((r) => !isLive(r))];
  }, [rooms, liveStatusMap]);

  // 模糊筛选：一并匹配 uid / 房间号 / 主播名 / 直播间标题
  const filterQuery = filterText.trim().toLowerCase();
  const filterActive = filterQuery.length > 0;
  const visibleRooms = useMemo(() => {
    if (!filterActive) return displayRooms;
    return displayRooms.filter(
      (room) =>
        room.uname.toLowerCase().includes(filterQuery) ||
        room.title.toLowerCase().includes(filterQuery) ||
        String(room.roomId).includes(filterQuery) ||
        (room.uid != null && String(room.uid).includes(filterQuery))
    );
  }, [displayRooms, filterActive, filterQuery]);

  // 拖拽预览：拖拽中按预览顺序渲染，否则按筛选后的显示顺序
  const previewRooms = useMemo(() => {
    if (!dragOrderIds) return visibleRooms;
    const byId = new Map(rooms.map((r) => [r.id, r] as const));
    return dragOrderIds
      .map((id) => byId.get(id))
      .filter((r): r is Room => r != null);
  }, [dragOrderIds, visibleRooms, rooms]);

  const handleDragMouseDown = (room: Room, event: React.MouseEvent) => {
    // 筛选态下顺序语义不完整，禁用拖拽；按在按钮上不启动拖拽，避免误触发点击
    if (filterActive || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;

    const setPreviewOrder = (ids: string[] | null) => {
      dragOrderIdsRef.current = ids;
      setDragOrderIds(ids);
    };
    const applyPreview = (targetId: string) => {
      const current = dragOrderIdsRef.current;
      if (!current) return;
      const from = current.indexOf(room.id);
      const to = current.indexOf(targetId);
      if (from < 0 || to < 0 || from === to) return;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, room.id);
      setPreviewOrder(next);
    };

    const onMove = (move: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      if (!state.active) {
        // 位移超过阈值才算拖拽，与普通点击区分
        if (Math.hypot(move.clientX - state.startX, move.clientY - state.startY) < 6) return;
        state.active = true;
        setDraggingId(room.id);
        setPreviewOrder(state.baseIds);
      }
      move.preventDefault();
      const hovered = document
        .elementFromPoint(move.clientX, move.clientY)
        ?.closest<HTMLElement>("[data-room-id]");
      if (hovered?.dataset.roomId) applyPreview(hovered.dataset.roomId);
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const state = dragStateRef.current;
      dragStateRef.current = null;
      if (state?.active && dragOrderIdsRef.current) {
        const ids = dragOrderIdsRef.current;
        // 持久化完整显示顺序（直播中在前），后续开播状态变化时组内仍按该顺序排列
        void tauriCommands.room.reorderRooms(ids.map(Number));
        const indexOf = new Map(ids.map((id, i) => [id, i] as const));
        useRoomStore.setState((store) => ({
          rooms: store.rooms.map((r) => {
            const idx = indexOf.get(r.id);
            return idx != null ? { ...r, sortOrder: idx } : r;
          })
        }));
      }
      setDraggingId(null);
      setPreviewOrder(null);
    };

    dragStateRef.current = {
      roomId: room.id,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      baseIds: visibleRooms.map((r) => r.id),
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const toggleViewMode = () => {
    const next = viewMode === "card" ? "list" : "card";
    setViewMode(next);
    void tauriCommands.selections.save({ roomViewMode: next });
  };

  useEffect(() => {
    let cancelled = false;

    const loadRooms = async () => {
      try {
        const savedRooms = await tauriCommands.state.getRooms();
        if (!cancelled) {
          useRoomStore.setState({ rooms: savedRooms });
        }
        if (!cancelled) {
          await refreshLiveStatus();
        }
      } catch {
        // 忽略初始化读取失败
      }
    };

    void loadRooms();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      className="flex h-full flex-col select-none"
      onContextMenu={(e) => {
        if (!import.meta.env.DEV) {
          e.preventDefault();
        }
      }}
    >
      {/* 编辑级页头 */}
      <header className="app-rise mb-6">
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
              直播间
            </h2>
              <p className="mt-2 flex items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400">
                <span className="numeric font-medium text-slate-700 dark:text-slate-200">{rooms.length}</span>
                个已添加
                {liveCount > 0 && (
                  <>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-brand" />
                    <span className="numeric font-medium text-brand">{liveCount}</span>
                    个直播中
                  </>
              )}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
                placeholder="UID/房间号/名称/标题"
                title="模糊筛选：UID、房间号、主播名、直播间标题"
                className="h-9 w-52 pl-8 pr-7 text-sm"
              />
              {filterText && (
                <button
                  onClick={() => setFilterText("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
                  title="清除筛选"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => void handleRefreshLiveStatus()}
              disabled={refreshing}
              className="glass-panel inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:text-slate-800 disabled:cursor-not-allowed dark:text-slate-400 dark:hover:text-white"
              title="刷新直播状态"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={toggleViewMode}
              className="glass-panel inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              title={viewMode === "card" ? "切换为列表显示" : "切换为封面显示"}
            >
              {viewMode === "card" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </button>
            <button
              onClick={() => navigate("/rooms/add")}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-medium text-brand-contrast transition hover:opacity-90 active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" />
              添加
            </button>
          </div>
        </div>
      </header>

      {mockEnabled && (
        <div className="app-rise mb-3 flex items-center gap-3 rounded-lg bg-brand/[0.06] px-3 py-2.5 shadow-sm ring-1 ring-brand/20">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">测试直播间（虚拟）</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">本地模拟弹幕流，无需连接真实直播间</p>
          </div>
          <button
            onClick={() => {
              void tauriCommands.room.openDanmaku(0);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-500 transition hover:bg-brand/10 hover:text-brand dark:hover:bg-brand/15 dark:hover:text-brand"
            title="打开弹幕"
          >
            <MonitorPlay className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rooms.length === 0 ? (
          <div className="app-rise flex flex-col items-center justify-center gap-4 rounded-lg bg-app-card px-6 py-20 text-center shadow-sm dark:bg-[#232327] dark:ring-1 dark:ring-white/[0.06]">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-brand dark:text-brand">
              <MonitorPlay className="h-8 w-8" strokeWidth={1.6} />
            </div>
            <div>
              <p className="text-[15px] font-medium text-slate-700 dark:text-slate-200">还没有添加直播间</p>
              <p className="mt-1.5 text-[13px] text-slate-400 dark:text-slate-500">
                点击右上角「添加」，搜索主播、房间号或粘贴直播链接
              </p>
            </div>
          </div>
        ) : previewRooms.length === 0 ? (
          <div className="app-rise rounded-lg bg-app-card px-6 py-16 text-center text-sm text-slate-400 shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:bg-[#232327] dark:text-slate-500 dark:ring-1 dark:ring-white/[0.06]">
            没有匹配的直播间
          </div>
        ) : viewMode === "list" ? (
          <div className="app-rise flex flex-col gap-1.5">
            {previewRooms.map((room) => {
              const active = currentRoomId === room.id;
              const isLive = room.uid != null && liveStatusMap[String(room.uid)];
              return (
                <div
                  key={room.id}
                  data-room-id={room.id}
                  onMouseDown={(e) => handleDragMouseDown(room, e)}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-1.5 transition-colors ${
                    draggingId === room.id
                      ? "opacity-60 outline outline-2 outline-brand"
                      : ""
                  } ${filterActive ? "" : "cursor-grab active:cursor-grabbing"} ${
                    isLive ? "bg-brand/[0.06]" : "hover:bg-ink/[0.04]"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      isLive ? "live-dot bg-brand" : "bg-slate-400 dark:bg-slate-500"
                    }`}
                  />
                  <p className="shrink-0 text-[13px] font-medium text-ink">{room.uname}</p>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">
                    {room.title || " "}
                  </span>
                  {active && (
                    <span className="shrink-0 rounded bg-brand/15 px-1.5 py-0.5 text-xs font-medium text-brand">当前</span>
                  )}
                  <span className="numeric shrink-0 text-xs text-ink-muted">{room.roomId}</span>
                  <span className={`w-12 shrink-0 text-right text-xs ${isLive ? "text-brand" : "text-ink-muted"}`}>
                    {isLive ? "直播中" : "未开播"}
                  </span>
                  <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      onClick={() => {
                        setCurrentRoomId(room.id);
                        void tauriCommands.selections.save({ currentRoomId: room.roomId });
                        void tauriCommands.room.openDanmaku(room.roomId);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded text-slate-500 transition hover:bg-brand/10 hover:text-brand dark:hover:bg-brand/15 dark:hover:text-brand"
                      title="打开弹幕"
                    >
                      <MonitorPlay className="h-4 w-4" />
                    </button>
                    <button
                      onClick={async () => {
                        const wasCurrent = currentRoomId === room.id;
                        await tauriCommands.room.remove(room.roomId);
                        removeRoom(room.roomId);
                        if (wasCurrent) {
                          void tauriCommands.selections.save({ currentRoomId: null });
                        }
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded text-slate-500 transition hover:bg-rose-50 hover:text-rose-500 dark:text-slate-400 dark:hover:bg-rose-500/15 dark:hover:text-rose-300"
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="app-rise grid gap-3 sm:grid-cols-3">
            {previewRooms.map((room) => {
              const active = currentRoomId === room.id;
              const isLive = room.uid != null && liveStatusMap[String(room.uid)];
              return (
                <div
                  key={room.id}
                  data-room-id={room.id}
                  onMouseDown={(e) => handleDragMouseDown(room, e)}
                  className={`group overflow-hidden rounded-xl bg-app-card shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_12px_-4px_rgba(0,0,0,0.08)] transition-[opacity,box-shadow] hover:shadow-[0_2px_4px_rgba(0,0,0,0.06),0_10px_24px_-8px_rgba(0,0,0,0.16)] ${
                    draggingId === room.id
                      ? "opacity-60 outline outline-2 outline-brand"
                      : ""
                  } ${filterActive ? "" : "cursor-grab active:cursor-grabbing"}`}
                >
                  <div className="relative aspect-video bg-ink/[0.05] dark:bg-[#232327]">
                    {room.cover ? (
                      <ProxiedImage
                        src={room.cover}
                        alt={room.title}
                        persistent
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-400 dark:text-slate-600">
                        <MonitorPlay className="h-10 w-10" />
                      </div>
                    )}

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-3 pt-10">
                      <div className="flex items-end justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {room.avatar ? (
                            <ProxiedImage
                              src={room.avatar}
                              alt={room.uname}
                              persistent
                              className="h-8 w-8 shrink-0 rounded-full border border-white/30 object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm text-white/60">
                              {room.uname.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white/90">{room.uname}</p>
                          </div>
                        </div>

                        <div className="flex shrink-0 gap-1.5 opacity-0 transition group-hover:opacity-100">
                          <button
                            onClick={() => {
                              setCurrentRoomId(room.id);
                              void tauriCommands.selections.save({ currentRoomId: room.roomId });
                              void tauriCommands.room.openDanmaku(room.roomId);
                            }}
                            className="flex h-8 w-8 items-center justify-center bg-white/20 text-white backdrop-blur transition hover:bg-white/30"
                            title="打开弹幕"
                          >
                            <MonitorPlay className="h-4 w-4" />
                          </button>
                          <button
                            onClick={async () => {
                              const wasCurrent = currentRoomId === room.id;
                              await tauriCommands.room.remove(room.roomId);
                              removeRoom(room.roomId);
                              if (wasCurrent) {
                                void tauriCommands.selections.save({ currentRoomId: null });
                              }
                            }}
                            className="flex h-8 w-8 items-center justify-center bg-white/20 text-white backdrop-blur transition hover:bg-rose-500/60"
                            title="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/50 to-transparent px-3 pb-4 pt-2">
                      <p className="truncate text-sm font-medium text-white">{room.title}</p>
                    </div>

                    <div className="absolute right-2 top-2 flex items-center gap-1.5">
                      {active && (
                        <span className="bg-brand px-2 py-0.5 text-xs font-medium text-brand-contrast">当前</span>
                      )}
                      <span className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium ${
                        isLive
                          ? "bg-brand text-brand-contrast"
                          : "bg-black/40 text-white/70"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-white animate-pulse" : "bg-white/50"}`} />
                        {isLive ? "直播中" : "未开播"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
