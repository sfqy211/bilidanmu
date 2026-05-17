import { useEffect, useMemo, useState } from "react";
import { MonitorPlay, Plus, Search, Trash2 } from "lucide-react";
import { PageTabs, TabContent } from "@/components/ui/PageTabs";
import { tauriCommands } from "@/lib/tauri";
import { useRoomStore } from "@/stores/room-store";
import type { SearchRoomMode } from "@/types/bilibili";

const searchModes: Array<{ value: SearchRoomMode; label: string; placeholder: string }> = [
  { value: "name", label: "主播名字", placeholder: "输入主播名字搜索直播间" },
  { value: "roomId", label: "直播间号", placeholder: "输入直播间号" },
  { value: "link", label: "直播链接", placeholder: "粘贴 bilibili 直播间链接" },
  { value: "uid", label: "UID", placeholder: "输入主播 UID" }
];

export function RoomPage() {
  const { rooms, currentRoomId, searchResults, setSearchResults, addRoom, removeRoom, setCurrentRoomId } =
    useRoomStore();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchRoomMode>("name");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingRoomIds, setAddingRoomIds] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState("rooms");
  const [liveStatusMap, setLiveStatusMap] = useState<Record<string, boolean>>({});

  const placeholder = useMemo(
    () => searchModes.find((item) => item.value === mode)?.placeholder ?? "输入搜索内容",
    [mode]
  );

  const refreshLiveStatus = async () => {
    try {
      const status = await tauriCommands.room.getRoomsLiveStatus();
      setLiveStatusMap(status);
    } catch {
      // 忽略刷新失败
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadRooms = async () => {
      try {
        const savedRooms = await tauriCommands.state.getRooms();
        if (!cancelled) {
          useRoomStore.setState({ rooms: savedRooms });
        }
        // 实时查询直播状态
        if (!cancelled) {
          await refreshLiveStatus();
        }
      } catch {
        // 忽略初始化读取失败，保留空状态
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
      setActiveTab("rooms");
      void refreshLiveStatus();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "添加失败");
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
      setError("请输入搜索内容");
      setSearchResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await tauriCommands.room.search(trimmed, mode);
      setSearchResults(results);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "搜索失败");
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">直播间</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">添加和管理直播间。</p>
        </div>
      </div>

      <PageTabs
        tabs={[
          { value: "rooms", label: `已添加 (${rooms.length})` },
          { value: "search", label: "搜索" }
        ]}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === "rooms") void refreshLiveStatus();
        }}
      >
        <TabContent value="search" className="flex flex-col gap-4">
          <div className="border border-slate-300 bg-white p-5 dark:border-white/[0.06] dark:bg-[#12141e]">
            <div className="grid gap-3 lg:grid-cols-[auto_1fr_auto]">
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as SearchRoomMode)}
                className="border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-slate-100"
              >
                {searchModes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-3 border border-slate-300 bg-white px-4 dark:border-white/[0.06] dark:bg-[#0e1018]">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void handleSearch();
                    }
                  }}
                  placeholder={placeholder}
                  className="h-12 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500"
                />
              </div>
              <button
                onClick={() => void handleSearch()}
                disabled={loading}
                className="bg-pink-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "搜索中..." : "搜索"}
              </button>
            </div>
            {error ? <p className="mt-3 text-sm text-rose-500 dark:text-rose-400">{error}</p> : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border border-slate-300 bg-white p-5 dark:border-white/[0.06] dark:bg-[#12141e]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">搜索结果</h3>
              <span className="text-xs text-slate-400 dark:text-slate-500">{searchResults.length} 个</span>
            </div>
            {searchResults.length === 0 ? (
              <div className="border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-400 dark:border-white/[0.06] dark:bg-[#0c0e18] dark:text-slate-500">
                暂无搜索结果，支持按主播名、直播间号、链接或 UID 查询。
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {searchResults.map((room) => {
                  const added = rooms.some((item) => item.roomId === room.roomId);
                  return (
                    <div
                      key={`search-${room.roomId}`}
                      className="flex items-center gap-3 border border-slate-200 bg-white p-3 dark:border-white/[0.06] dark:bg-[#161822]"
                    >
                      <span className={`h-2 w-2 shrink-0 ${room.isLive ? "bg-rose-500" : "bg-slate-400 dark:bg-slate-500"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{room.uname}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{room.title}</p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{room.roomId}</span>
                      <button
                        onClick={() => void handleAddRoom(room.roomId)}
                        disabled={added || addingRoomIds.has(room.roomId)}
                        className="shrink-0 border border-pink-200 p-1.5 text-pink-500 transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-pink-400/30 dark:text-pink-300 dark:hover:bg-pink-500/20"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabContent>

        <TabContent value="rooms" className="min-h-0 flex-1 overflow-y-auto">
          {rooms.length === 0 ? (
            <div className="border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-400 dark:border-white/[0.06] dark:bg-[#0c0e18] dark:text-slate-500">
              还没有添加直播间。先从搜索中添加一个。
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {rooms.map((room) => {
                const active = currentRoomId === room.id;
                return (
                  <div
                    key={room.id}
                    className={`flex flex-col gap-3 border p-4 transition ${
                      active
                        ? "border-pink-300 bg-pink-50 dark:border-pink-500/40 dark:bg-pink-500/[0.08]"
                        : "border-slate-200 bg-white dark:border-white/[0.06] dark:bg-[#161822]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 ${room.uid != null && liveStatusMap[String(room.uid)] ? "bg-rose-500" : "bg-slate-400 dark:bg-slate-500"}`} />
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{room.uname}</p>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{room.roomId}</span>
                      {active ? (
                        <span className="bg-pink-100 px-2 py-0.5 text-xs text-pink-600 dark:bg-pink-500/20 dark:text-pink-300">当前</span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-slate-600 dark:text-slate-300">{room.title}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {room.uid != null && liveStatusMap[String(room.uid)] ? "直播中" : "未开播"}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setCurrentRoomId(room.id);
                          void tauriCommands.selections.save({ currentRoomId: room.roomId });
                          void tauriCommands.room.openDanmaku(room.roomId);
                        }}
                        className="inline-flex items-center gap-1 bg-cyan-50 px-3 py-1.5 text-xs text-cyan-700 transition hover:bg-cyan-100 dark:bg-cyan-500/20 dark:text-cyan-300 dark:hover:bg-cyan-500/30"
                      >
                        <MonitorPlay className="h-3 w-3" />
                        打开弹幕
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
                        className="inline-flex items-center gap-1 border border-rose-200 px-3 py-1.5 text-xs text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/20 dark:text-rose-300 dark:hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabContent>
      </PageTabs>
    </section>
  );
}
