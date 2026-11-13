import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  LayoutGrid,
  List,
  ListChecks,
  MonitorPlay,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { FavoriteManageDialog } from "@/components/rooms/FavoriteManageDialog";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { PageHeader } from "@/components/layout/PageHeader";
import { tauriCommands } from "@/lib/tauri";
import { useRoomStore } from "@/stores/room-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { Room } from "@/types/bilibili";

// 计数与序号统一两位数字（01、03），对齐分区头与筛选胶囊的排版
const pad2 = (value: number) => String(value).padStart(2, "0");

type StatusTab = "all" | "live" | "offline";

type RoomLiveStatusMap = Record<string, { isLive: boolean; liveStartTime: number | null }>;

const roomIsLive = (room: Room, liveStatusMap: RoomLiveStatusMap) =>
  room.uid != null && Boolean(liveStatusMap[String(room.uid)]?.isLive);

// 已播时长：分钟粒度（30s ticker 驱动刷新），跨天降级为"天+小时"
const formatDuration = (elapsedMs: number) => {
  const totalMinutes = Math.floor(elapsedMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}天${hours}小时`;
  if (hours > 0) return `${hours}小时${String(minutes).padStart(2, "0")}分`;
  return `${minutes}分钟`;
};

// 上次直播时间：今天/昨天带时刻，更早只到日期
const formatLastLive = (startSec: number) => {
  const date = new Date(startSec * 1000);
  const nowDate = new Date();
  const hhmm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(nowDate);
  yesterday.setDate(nowDate.getDate() - 1);
  if (sameDay(date, nowDate)) return `今天 ${hhmm}`;
  if (sameDay(date, yesterday)) return `昨天 ${hhmm}`;
  if (date.getFullYear() === nowDate.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};

const formatFullTime = (startSec: number) => {
  const date = new Date(startSec * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function RoomPage() {
  const navigate = useNavigate();
  const { rooms, currentRoomId, viewMode, favoriteIds, setFavoriteIds, toggleFavorite, removeRoom, setCurrentRoomId, setViewMode } =
    useRoomStore();
  // 只看收藏：过滤开关（与搜索框、状态筛选可叠加）
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // 按直播状态筛选：全部 / 直播中 / 未开播
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  // 分区折叠：正在直播 / 未开播各自独立收起展开（会话内状态，不持久化）
  const [liveExpanded, setLiveExpanded] = useState(true);
  const [offlineExpanded, setOfflineExpanded] = useState(true);
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
  const showAvatars = useSettingsStore((state) => state.settings.showAvatars);

  const [liveStatusMap, setLiveStatusMap] = useState<RoomLiveStatusMap>({});
  const [mockEnabled, setMockEnabled] = useState(false);
  // 已播时长的计时基准：30s 粒度刷新（展示到分钟，足够精确且避免每秒重渲染）
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    tauriCommands.room.isMockEnabled().then(setMockEnabled).catch(() => {});
  }, []);

  const liveCount = useMemo(
    () => rooms.filter((r) => roomIsLive(r, liveStatusMap)).length,
    [rooms, liveStatusMap]
  );

  const refreshLiveStatus = async () => {
    try {
      const status = await tauriCommands.room.getRoomsLiveStatus();
      // 状态与开播时间一起用；开播中的场次已由 Rust 侧回填 rooms.last_live_start，
      // 回读一次房间列表让未开播房间的"上次直播时间"跟上最新记录
      setLiveStatusMap(status);
      const savedRooms = await tauriCommands.state.getRooms();
      useRoomStore.setState({ rooms: savedRooms });
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
    const ordered = [...rooms].sort((a, b) => a.sortOrder - b.sortOrder);
    return [...ordered.filter((r) => roomIsLive(r, liveStatusMap)), ...ordered.filter((r) => !roomIsLive(r, liveStatusMap))];
  }, [rooms, liveStatusMap]);

  // 模糊筛选：一并匹配 uid / 房间号 / 主播名 / 直播间标题
  const filterQuery = filterText.trim().toLowerCase();
  const filterActive = filterQuery.length > 0;
  const visibleRooms = useMemo(() => {
    let base = displayRooms;
    if (favoriteOnly) base = base.filter((room) => favoriteIds.includes(room.roomId));
    if (statusTab === "live") base = base.filter((room) => roomIsLive(room, liveStatusMap));
    else if (statusTab === "offline") base = base.filter((room) => !roomIsLive(room, liveStatusMap));
    if (!filterActive) return base;
    return base.filter(
      (room) =>
        room.uname.toLowerCase().includes(filterQuery) ||
        room.title.toLowerCase().includes(filterQuery) ||
        String(room.roomId).includes(filterQuery) ||
        (room.uid != null && String(room.uid).includes(filterQuery))
    );
  }, [displayRooms, favoriteOnly, favoriteIds, filterActive, filterQuery, statusTab, liveStatusMap]);

  // 拖拽预览：拖拽中按预览顺序渲染，否则按筛选后的显示顺序
  const previewRooms = useMemo(() => {
    if (!dragOrderIds) return visibleRooms;
    const byId = new Map(rooms.map((r) => [r.id, r] as const));
    return dragOrderIds
      .map((id) => byId.get(id))
      .filter((r): r is Room => r != null);
  }, [dragOrderIds, visibleRooms, rooms]);

  // 分区渲染：拖拽预览顺序组内稳定，仍按开播状态拆成两组
  const liveRooms = useMemo(() => previewRooms.filter((r) => roomIsLive(r, liveStatusMap)), [previewRooms, liveStatusMap]);
  const offlineRooms = useMemo(() => previewRooms.filter((r) => !roomIsLive(r, liveStatusMap)), [previewRooms, liveStatusMap]);

  // 拖拽在三个标签页里都能用：可见集合只是完整列表的一部分时，落手时把可见顺序
  // 按位写回完整顺序（见 onUp）。搜索与只看收藏仍禁用，那两种筛选下顺序语义太弱。
  const canDrag = !filterActive && !favoriteOnly;

  const handleDragMouseDown = (room: Room, event: React.MouseEvent) => {
    // 按在按钮上不启动拖拽，避免误触发点击
    if (!canDrag || event.button !== 0) return;
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
        const visibleIds = dragOrderIdsRef.current;
        // 状态筛选下可见集合只是完整顺序的一段：把重排后的可见顺序按位写回，
        // 被筛掉的房间在完整顺序里的位置保持不变，否则它们的 sort_order 会被挤乱
        const visibleSet = new Set(visibleIds);
        let cursor = 0;
        const ids = displayRooms.map((item) => (visibleSet.has(item.id) ? visibleIds[cursor++] : item.id));
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

  // 收藏切换：更新本地状态并持久化到 selections（本地数据，与账号无关）
  const handleToggleFavorite = (room: Room) => {
    const nowFavorite = toggleFavorite(room.roomId);
    void tauriCommands.selections.save({ favoriteRoomIds: useRoomStore.getState().favoriteIds });
    if (!nowFavorite && favoriteOnly) {
      // 只看收藏模式下取消收藏，该房间立即从列表消失
      setFavoriteIds(useRoomStore.getState().favoriteIds);
    }
  };

  const handleSetViewMode = (mode: "card" | "list") => {
    if (mode === viewMode) return;
    setViewMode(mode);
    void tauriCommands.selections.save({ roomViewMode: mode });
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

  const statusTabs: { value: StatusTab; label: string; count: number }[] = [
    { value: "all", label: "全部", count: rooms.length },
    { value: "live", label: "直播中", count: liveCount },
    { value: "offline", label: "未开播", count: rooms.length - liveCount },
  ];

  // 时间段（列表行与封面卡共用）：直播中=已播时长（开播时间取接口下发，兜底本地记录）；
  // 未开播=上次直播时间。没有可展示的时间时返回 null。
  const getRoomTimeInfo = (room: Room): { text: string; tooltip: string } | null => {
    if (roomIsLive(room, liveStatusMap)) {
      const startSec = liveStatusMap[String(room.uid ?? "")]?.liveStartTime ?? room.lastLiveStart;
      if (!startSec) return null;
      const elapsedMs = now - startSec * 1000;
      return {
        text: elapsedMs < 60_000 ? "刚开播" : `已播 ${formatDuration(elapsedMs)}`,
        tooltip: `开播于 ${formatFullTime(startSec)}`,
      };
    }
    if (!room.lastLiveStart) return null;
    return {
      text: formatLastLive(room.lastLiveStart),
      tooltip: `上次直播：${formatFullTime(room.lastLiveStart)}`,
    };
  };

  // 分区头：状态点 + 标题 + 数量 + 填充线 + 收起/展开
  const renderSectionHeader = (opts: { live: boolean; label: string; count: number; expanded: boolean; onToggle: () => void }) => (
    <div className="room-section-header">
      <span className={`room-section-dot ${opts.live ? "room-section-dot-live" : "room-section-dot-offline"}`} aria-hidden="true" />
      <h3 className="room-section-title">{opts.label}</h3>
      <span className="room-section-count numeric">{pad2(opts.count)}</span>
      <span className="room-section-rule" aria-hidden="true" />
      <button
        onClick={opts.onToggle}
        className="room-section-toggle"
        aria-expanded={opts.expanded}
        aria-label={opts.expanded ? `收起${opts.label}分区` : `展开${opts.label}分区`}
      >
        {opts.expanded ? "收起" : "展开"}
        {opts.expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
    </div>
  );

  // 分区渲染：两个状态分组，空组不渲染；行渲染由调用方决定（列表行 / 封面卡）
  const renderGrouped = (renderItems: (list: Room[]) => ReactNode) => (
    <>
      {liveRooms.length > 0 && (
        <section className="room-section">
          {renderSectionHeader({
            live: true,
            label: "正在直播",
            count: liveRooms.length,
            expanded: liveExpanded,
            onToggle: () => setLiveExpanded((v) => !v),
          })}
          {liveExpanded && <div className="mt-2">{renderItems(liveRooms)}</div>}
        </section>
      )}
      {offlineRooms.length > 0 && (
        <section className="room-section">
          {renderSectionHeader({
            live: false,
            label: "未开播",
            count: offlineRooms.length,
            expanded: offlineExpanded,
            onToggle: () => setOfflineExpanded((v) => !v),
          })}
          {offlineExpanded && <div className="mt-2">{renderItems(offlineRooms)}</div>}
        </section>
      )}
    </>
  );

  const renderListRow = (room: Room) => {
    const active = currentRoomId === room.id;
    const isLive = roomIsLive(room, liveStatusMap);
    const timeInfo = getRoomTimeInfo(room);
    return (
      <div
        key={room.id}
        data-room-id={room.id}
        onMouseDown={(e) => handleDragMouseDown(room, e)}
        className={`room-list-row room-list-grid group ${
          draggingId === room.id
            ? "opacity-60 outline outline-2 outline-brand"
            : ""
        } ${canDrag ? "cursor-grab active:cursor-grabbing" : ""} ${
          active ? "room-list-row-current" : ""
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate text-[13px] font-medium text-ink" title={room.uname}>{room.uname}</p>
          {active && <span className="room-current-label shrink-0 text-[11px] font-medium">当前</span>}
        </div>
        <span className="min-w-0 truncate text-[13px] text-ink-muted" title={room.title || undefined}>
          {room.title || "暂无直播标题"}
        </span>
        {isLive ? (
          <span
            className="room-row-status room-row-status-live"
            title={timeInfo?.tooltip ?? "直播中"}
          >
            <span className="room-row-dot h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
            直播中
            {timeInfo && <span className="room-row-time numeric">{timeInfo.text}</span>}
          </span>
        ) : (
          <span
            className="room-row-status"
            title={timeInfo?.tooltip ?? "未开播"}
          >
            <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
            未开播
            {timeInfo && <span className="room-row-time numeric">{timeInfo.text}</span>}
          </span>
        )}
        <div className="room-row-actions flex shrink-0 items-center gap-0.5">
          <span className="room-row-divider mx-1.5" aria-hidden="true" />
          <button
            onClick={() => handleToggleFavorite(room)}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
              favoriteIds.includes(room.roomId)
                ? "text-brand"
                : "text-slate-500 hover:bg-brand/10 hover:text-brand dark:text-slate-400 dark:hover:bg-brand/15 dark:hover:text-brand"
            }`}
            aria-pressed={favoriteIds.includes(room.roomId)}
            title={favoriteIds.includes(room.roomId) ? "取消收藏" : "收藏"}
          >
            <Star className={`h-4 w-4 ${favoriteIds.includes(room.roomId) ? "fill-brand" : ""}`} />
          </button>
          <button
            onClick={() => {
              setCurrentRoomId(room.id);
              void tauriCommands.selections.save({ currentRoomId: room.roomId });
              void tauriCommands.room.openDanmaku(room.roomId);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-brand/10 hover:text-brand dark:text-slate-400 dark:hover:bg-brand/15 dark:hover:text-brand"
            title="打开弹幕"
          >
            <MonitorPlay className="h-4 w-4" />
          </button>
          <button
            onClick={async () => {
              const wasCurrent = currentRoomId === room.id;
              await tauriCommands.room.remove(room.roomId);
              removeRoom(room.roomId);
              void tauriCommands.selections.save({ favoriteRoomIds: useRoomStore.getState().favoriteIds });
              if (wasCurrent) {
                void tauriCommands.selections.save({ currentRoomId: null });
              }
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-rose-50 hover:text-rose-500 dark:text-slate-400 dark:hover:bg-rose-500/15 dark:hover:text-rose-300"
            title="删除"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderCoverItem = (room: Room) => {
    const active = currentRoomId === room.id;
    const isLive = roomIsLive(room, liveStatusMap);
    const timeInfo = getRoomTimeInfo(room);
    return (
      <div
        key={room.id}
        data-room-id={room.id}
        onMouseDown={(e) => handleDragMouseDown(room, e)}
        className={`room-cover-item group min-w-0 ${
          draggingId === room.id
            ? "opacity-60 outline outline-2 outline-brand"
            : ""
        } ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        <div className="room-cover-image relative aspect-video overflow-hidden rounded-lg bg-app-surface">
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

          <div className="room-cover-top absolute inset-x-0 top-0 flex items-center gap-2 px-3 pb-6 pt-3">
            <p className="min-w-0 flex-1 truncate text-[13px] font-medium" title={room.title || undefined}>
              {room.title || "暂无直播标题"}
            </p>
            {active && <span className="room-cover-badge room-cover-current shrink-0 px-2 py-0.5 text-[11px] font-medium">当前</span>}
            {isLive ? (
              <span className="room-cover-live flex shrink-0 items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium" title={timeInfo?.tooltip ?? "直播中"}>
                <span className="room-cover-live-dot h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden="true" />
                直播中
                {timeInfo && <span className="room-cover-time numeric">{timeInfo.text}</span>}
              </span>
            ) : (
              <span className="room-cover-badge shrink-0 px-2 py-0.5 text-[11px]" title={timeInfo?.tooltip ?? "未开播"}>
                未开播
                {timeInfo && <span className="room-cover-time numeric">{timeInfo.text}</span>}
              </span>
            )}
          </div>
          <div className="room-cover-bottom absolute inset-x-0 bottom-0 flex min-w-0 items-center gap-2 px-3 pb-3 pt-8">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {showAvatars && (room.avatar ? (
                  <ProxiedImage
                    src={room.avatar}
                    alt={room.uname}
                    persistent
                    className="h-7 w-7 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="room-cover-badge flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs">
                    {room.uname.charAt(0)}
                  </div>
                ))}
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium" title={`${room.uname} · 房间号 ${room.roomId}`}>{room.uname}</p>
                </div>
              </div>

            <div className="room-row-actions flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  onClick={() => handleToggleFavorite(room)}
                  className={`room-cover-button flex h-7 w-7 items-center justify-center ${
                    favoriteIds.includes(room.roomId) ? "text-brand" : ""
                  }`}
                  aria-label={favoriteIds.includes(room.roomId) ? `取消收藏 ${room.uname}` : `收藏 ${room.uname}`}
                  aria-pressed={favoriteIds.includes(room.roomId)}
                  title={favoriteIds.includes(room.roomId) ? "取消收藏" : "收藏"}
                >
                  <Star className={`h-4 w-4 ${favoriteIds.includes(room.roomId) ? "fill-brand" : ""}`} />
                </button>
                <button
                  onClick={() => {
                    setCurrentRoomId(room.id);
                    void tauriCommands.selections.save({ currentRoomId: room.roomId });
                    void tauriCommands.room.openDanmaku(room.roomId);
                  }}
                  className="room-cover-button flex h-7 w-7 items-center justify-center"
                  aria-label={`打开 ${room.uname} 的弹幕`}
                  title="打开弹幕"
                >
                  <MonitorPlay className="h-4 w-4" />
                </button>
                <button
                  onClick={async () => {
                    const wasCurrent = currentRoomId === room.id;
                    await tauriCommands.room.remove(room.roomId);
                    removeRoom(room.roomId);
                    void tauriCommands.selections.save({ favoriteRoomIds: useRoomStore.getState().favoriteIds });
                    if (wasCurrent) {
                      void tauriCommands.selections.save({ currentRoomId: null });
                    }
                  }}
                  className="room-cover-button room-cover-delete flex h-7 w-7 items-center justify-center"
                  aria-label={`删除 ${room.uname} 的直播间`}
                  title="删除"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      className="room-workspace flex h-full min-h-0 flex-col select-none"
      onContextMenu={(e) => {
        if (!import.meta.env.DEV) {
          e.preventDefault();
        }
      }}
    >
      <PageHeader title="直播间" description={
              <p className="flex items-center gap-2">
                <span><span className="numeric">{rooms.length}</span> 个直播间</span>
                {liveCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span><span className="numeric">{pad2(liveCount)}</span> 个直播中</span>
                  </>
              )}
            </p>
      } actions={
          <div className="room-toolbar flex max-w-full flex-wrap items-center gap-1.5">
            <div className="room-search-wrap relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
                placeholder="搜索直播间..."
                aria-label="搜索直播间：UID、房间号、主播名或标题"
                title="模糊筛选：UID、房间号、主播名、直播间标题"
                className="room-search h-8 w-52 max-w-full pl-9 pr-7 text-[13px]"
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
              onClick={() => setManageOpen(true)}
              disabled={favoriteIds.length === 0}
              className="room-tool-button inline-flex h-8 w-8 shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="管理收藏"
              title="管理收藏"
            >
              <ListChecks className="h-4 w-4" />
            </button>
            <button
              onClick={() => setFavoriteOnly((v) => !v)}
              className={`room-tool-button inline-flex h-8 w-8 shrink-0 items-center justify-center ${
                favoriteOnly ? "text-brand" : ""
              }`}
              aria-pressed={favoriteOnly}
              aria-label={favoriteOnly ? "显示全部直播间" : "只看收藏的直播间"}
              title={favoriteOnly ? "显示全部直播间" : "只看收藏"}
            >
              <Star className={`h-4 w-4 ${favoriteOnly ? "fill-brand" : ""}`} />
            </button>
            <button
              onClick={() => void handleRefreshLiveStatus()}
              disabled={refreshing}
              className="room-tool-button ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="刷新直播状态"
              title="刷新直播状态"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <div className="room-view-toggle" role="group" aria-label="显示方式">
              <button
                onClick={() => handleSetViewMode("list")}
                className={`room-view-option ${viewMode === "list" ? "room-view-option-active" : ""}`}
                aria-pressed={viewMode === "list"}
                aria-label="切换为列表显示"
                title="列表显示"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleSetViewMode("card")}
                className={`room-view-option ${viewMode === "card" ? "room-view-option-active" : ""}`}
                aria-pressed={viewMode === "card"}
                aria-label="切换为封面显示"
                title="封面显示"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => navigate("/rooms/add")}
              className="workspace-button workspace-button-primary workspace-button-pill ml-1"
            >
              <Plus className="h-4 w-4" />
              添加
            </button>
          </div>
      } />

      {rooms.length > 0 && (
        <div className="app-rise mb-4">
          <div className="room-tabs" role="tablist" aria-label="按直播状态筛选">
            {statusTabs.map((tab) => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={statusTab === tab.value}
                onClick={() => setStatusTab(tab.value)}
                className={`room-tab ${statusTab === tab.value ? "room-tab-active" : ""}`}
              >
                {tab.label}
                <span className="room-tab-count numeric">{pad2(tab.count)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mockEnabled && (
        <div className="app-rise mb-4 flex items-center gap-3 rounded-lg bg-brand/[0.06] px-3 py-2.5 shadow-sm ring-1 ring-brand/20">
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
          <div className="workspace-empty">
            <div>
              <p className="text-[15px] font-medium text-slate-700 dark:text-slate-200">还没有添加直播间</p>
              <p className="mt-1.5 text-[13px] text-slate-400 dark:text-slate-500">
                点击右上角「添加」，搜索主播、房间号或粘贴直播链接
              </p>
            </div>
          </div>
        ) : previewRooms.length === 0 ? (
          <div className="workspace-empty">
            {favoriteOnly && !filterActive ? "还没有收藏的直播间，点击房间卡片上的星标进行收藏" : "没有匹配的直播间"}
          </div>
        ) : viewMode === "list" ? (
          <div className="app-rise">
            {renderGrouped((list) => <div className="room-list">{list.map(renderListRow)}</div>)}
          </div>
        ) : (
          <div className="app-rise">
            {renderGrouped((list) => <div className="room-cover-grid">{list.map(renderCoverItem)}</div>)}
          </div>
        )}
      </div>
      <FavoriteManageDialog
        open={manageOpen}
        rooms={rooms.filter((room) => favoriteIds.includes(room.roomId))}
        onRemove={(roomId) => {
          const next = favoriteIds.filter((id) => id !== roomId);
          setFavoriteIds(next);
          void tauriCommands.selections.save({ favoriteRoomIds: next });
        }}
        onClose={() => setManageOpen(false)}
      />
    </section>
  );
}
