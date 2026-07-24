import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, MonitorPlay, Plus, Trash2, X } from "lucide-react";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { tauriCommands } from "@/lib/tauri";
import { loadWindowSize } from "@/hooks/useWindowPersistence";
import { useRoomStore } from "@/stores/room-store";
import type { SearchRoomMode } from "@/types/bilibili";

const searchModes: Array<{ value: SearchRoomMode; label: string; placeholder: string }> = [
  { value: "name", label: "主播名字", placeholder: "输入主播名字搜索直播间" },
  { value: "roomId", label: "直播间号", placeholder: "输入直播间号" },
  { value: "link", label: "直播链接", placeholder: "粘贴 bilibili 直播间链接" },
  { value: "uid", label: "UID", placeholder: "输入主播 UID" }
];

export function RoomPage() {
  const { rooms, currentRoomId, searchResults, viewMode, setSearchResults, addRoom, removeRoom, setCurrentRoomId, setViewMode } =
    useRoomStore();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchRoomMode>("name");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);
  const [addingRoomIds, setAddingRoomIds] = useState<Set<number>>(new Set());
  const [showSearch, setShowSearch] = useState(false);

  const showError = (msg: string) => { setError(msg); setMsgKey((k) => k + 1); };
  const clearMessage = () => { setError(null); };
  const [liveStatusMap, setLiveStatusMap] = useState<Record<string, boolean>>({});

  const placeholder = useMemo(
    () => searchModes.find((item) => item.value === mode)?.placeholder ?? "输入搜索内容",
    [mode]
  );

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

      // 恢复上次的视图模式（卡片/列表）
      try {
        const selections = await tauriCommands.selections.load(["roomViewMode"]);
        if (!cancelled && (selections.roomViewMode === "card" || selections.roomViewMode === "list")) {
          setViewMode(selections.roomViewMode);
        }
      } catch {
        // 忽略视图模式读取失败
      }
    };

    void loadRooms();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddRoom = async (roomId: number) => {
    setAddingRoomIds((prev) => new Set(prev).add(roomId));
    try {
      const roomInfo = await tauriCommands.room.add(roomId);
      addRoom(roomInfo);
      setShowSearch(false);
      void refreshLiveStatus();
    } catch (addError) {
      showError(addError instanceof Error ? addError.message : "添加失败");
    } finally {
      setAddingRoomIds((prev) => {
        const next = new Set(prev);
        next.delete(roomId);
        return next;
      });
    }
  };

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      showError("请输入搜索内容");
      setSearchResults([]);
      return;
    }

    setLoading(true);
    clearMessage();

    try {
      const results = await tauriCommands.room.search(trimmed, mode);
      setSearchResults(results);
    } catch (searchError) {
      showError(searchError instanceof Error ? searchError.message : "搜索失败");
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

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
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="overline-label text-pink-500/90 dark:text-pink-400/90">Live Rooms</p>
            <h2 className="mt-2 text-[34px] font-bold leading-none tracking-tight text-slate-900 dark:text-white">
              直播间
            </h2>
            <p className="mt-3 flex items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400">
              <span className="numeric font-medium text-slate-700 dark:text-slate-200">{rooms.length}</span>
              个已添加
              {liveCount > 0 && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
                  <span className="numeric font-medium text-rose-500">{liveCount}</span>
                  个直播中
                </>
              )}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={toggleViewMode}
              className="glass-panel inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              title={viewMode === "card" ? "切换为列表显示" : "切换为封面显示"}
            >
              {viewMode === "card" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setShowSearch((v) => !v)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-pink-500 px-4 text-sm font-medium text-white shadow-[0_4px_16px_-4px_rgba(236,72,153,0.5)] transition hover:bg-pink-400 active:scale-[0.97]"
            >
              {showSearch ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showSearch ? "关闭" : "添加"}
            </button>
          </div>
        </div>
      </header>

      {showSearch && (
        <div className="app-rise mb-4 flex flex-col gap-4">
          <div className="rounded-lg bg-[#f8f8f8] p-5 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
            <div className="flex gap-2">
              <Select value={mode} onValueChange={(v) => setMode(v as SearchRoomMode)}>
                <SelectTrigger className="h-9 w-auto shrink-0 gap-1.5 px-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {searchModes.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleSearch();
                  }
                }}
                placeholder={placeholder}
                className="h-9 flex-1 px-3 text-sm"
              />
              <button
                onClick={() => void handleSearch()}
                disabled={loading}
                className="shrink-0 rounded-md bg-pink-500 px-4 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "搜索中..." : "搜索"}
              </button>
            </div>
            {error && <InlineMessage key={msgKey} type="error" className="mt-3">{error}</InlineMessage>}
          </div>

          {searchResults.length > 0 && (
            <div className="rounded-lg bg-[#f8f8f8] p-5 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">搜索结果</h3>
                <span className="numeric text-xs text-slate-400 dark:text-slate-500">{searchResults.length} 个</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {searchResults.map((room) => {
                  const added = rooms.some((item) => item.roomId === room.roomId);
                  return (
                    <div
                      key={`search-${room.roomId}`}
                      className="flex items-center gap-3 rounded-lg bg-[#f8f8f8] p-3 shadow-sm dark:bg-[#161822] dark:ring-1 dark:ring-white/[0.06]"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${room.isLive ? "live-dot bg-rose-500" : "bg-slate-400 dark:bg-slate-500"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{room.uname}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{room.title}</p>
                      </div>
                      <span className="numeric shrink-0 text-xs text-slate-400 dark:text-slate-500">{room.roomId}</span>
                      <button
                        onClick={() => void handleAddRoom(room.roomId)}
                        disabled={added || addingRoomIds.has(room.roomId)}
                        className="shrink-0 rounded p-1.5 text-pink-500 transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-pink-300 dark:hover:bg-pink-500/20"
                        title={added ? "已添加" : "添加"}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rooms.length === 0 ? (
          <div className="app-rise flex flex-col items-center justify-center gap-4 rounded-lg bg-[#f8f8f8] px-6 py-20 text-center shadow-sm dark:bg-[#0e1018] dark:ring-1 dark:ring-white/[0.06]">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-pink-500/10 text-pink-500 dark:text-pink-400">
              <MonitorPlay className="h-8 w-8" strokeWidth={1.6} />
            </div>
            <div>
              <p className="text-[15px] font-medium text-slate-700 dark:text-slate-200">还没有添加直播间</p>
              <p className="mt-1.5 text-[13px] text-slate-400 dark:text-slate-500">
                点击右上角「添加」，搜索主播、房间号或粘贴直播链接
              </p>
            </div>
          </div>
        ) : viewMode === "list" ? (
          <div className="app-rise flex flex-col gap-2">
            {rooms.map((room) => {
              const active = currentRoomId === room.id;
              const isLive = room.uid != null && liveStatusMap[String(room.uid)];
              return (
                <div
                  key={room.id}
                  className="group flex items-center gap-3 rounded-lg bg-[#f8f8f8] px-3 py-2.5 shadow-sm dark:bg-[#161822] dark:ring-1 dark:ring-white/[0.06]"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${isLive ? "live-dot bg-rose-500" : "bg-slate-400 dark:bg-slate-500"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{room.uname}</p>
                      {active && (
                        <span className="shrink-0 rounded bg-pink-500/15 px-1.5 py-0.5 text-xs font-medium text-pink-600 dark:text-pink-300">当前</span>
                      )}
                    </div>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{room.title}</p>
                  </div>
                  <span className="numeric shrink-0 text-xs text-slate-400 dark:text-slate-500">{room.roomId}</span>
                  <span className={`shrink-0 text-xs font-medium ${isLive ? "text-rose-500" : "text-slate-400 dark:text-slate-500"}`}>
                    {isLive ? "直播中" : "未开播"}
                  </span>
                  <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      onClick={() => {
                        setCurrentRoomId(room.id);
                        void tauriCommands.selections.save({ currentRoomId: room.roomId });
                        const { width, height } = loadWindowSize("danmaku-window");
                        void tauriCommands.room.openDanmaku(room.roomId, width, height);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded text-slate-500 transition hover:bg-pink-50 hover:text-pink-500 dark:text-slate-400 dark:hover:bg-pink-500/15 dark:hover:text-pink-300"
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
            {rooms.map((room) => {
              const active = currentRoomId === room.id;
              const isLive = room.uid != null && liveStatusMap[String(room.uid)];
              return (
                <div
                  key={room.id}
                  className="group overflow-hidden rounded-lg shadow-sm transition dark:ring-1 dark:ring-white/[0.06]"
                >
                  <div className="relative aspect-video bg-[#ebebeb] dark:bg-[#0e1018]">
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
                              const { width, height } = loadWindowSize("danmaku-window");
                              void tauriCommands.room.openDanmaku(room.roomId, width, height);
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
                        <span className="bg-pink-500/80 px-2 py-0.5 text-xs font-medium text-white">当前</span>
                      )}
                      <span className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium ${
                        isLive
                          ? "bg-rose-500/80 text-white"
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
