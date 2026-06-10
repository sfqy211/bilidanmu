import { useEffect, useMemo, useState } from "react";
import { MonitorPlay, Plus, Search, Trash2 } from "lucide-react";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { PageTabs, TabContent } from "@/components/ui/PageTabs";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
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
  const { rooms, currentRoomId, searchResults, setSearchResults, addRoom, removeRoom, setCurrentRoomId } =
    useRoomStore();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchRoomMode>("name");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);
  const [addingRoomIds, setAddingRoomIds] = useState<Set<number>>(new Set());

  const showError = (msg: string) => { setError(msg); setMsgKey((k) => k + 1); };
  const clearMessage = () => { setError(null); };
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
          <div className="rounded-lg bg-[#f8f8f8] p-5 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
            <div className="grid gap-3 lg:grid-cols-[auto_1fr_auto]">
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as SearchRoomMode)}
                className="rounded border border-neutral-200 bg-[#f8f8f8] px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-pink-500/30 dark:border-neutral-700 dark:bg-[#1a1c24] dark:text-slate-100"
              >
                {searchModes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-3 rounded border border-neutral-200 bg-[#f8f8f8] px-4 dark:border-neutral-700 dark:bg-[#1a1c24]">
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
                className="rounded bg-pink-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "搜索中..." : "搜索"}
              </button>
            </div>
            {error && <InlineMessage key={msgKey} type="error" className="mt-3">{error}</InlineMessage>}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-[#f8f8f8] p-5 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">搜索结果</h3>
              <span className="text-xs text-slate-400 dark:text-slate-500">{searchResults.length} 个</span>
            </div>
            {searchResults.length === 0 ? (
              <div className="rounded-lg bg-[#f0f0f0] p-6 text-center text-sm text-slate-400 ring-1 ring-slate-200 dark:bg-[#0e1018] dark:text-slate-500 dark:ring-white/[0.06]">
                暂无搜索结果，支持按主播名、直播间号、链接或 UID 查询。
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {searchResults.map((room) => {
                  const added = rooms.some((item) => item.roomId === room.roomId);
                  return (
                    <div
                      key={`search-${room.roomId}`}
                      className="flex items-center gap-3 rounded-lg bg-[#f8f8f8] p-3 shadow-sm dark:bg-[#161822] dark:ring-1 dark:ring-white/[0.06]"
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
                        className="shrink-0 p-1.5 text-pink-500 transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-pink-300 dark:hover:bg-pink-500/20"
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
            <div className="rounded-lg bg-[#f0f0f0] p-6 text-center text-sm text-slate-400 ring-1 ring-slate-200 dark:bg-[#0e1018] dark:text-slate-500 dark:ring-white/[0.06]">
              还没有添加直播间。先从搜索中添加一个。
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {rooms.map((room) => {
                const active = currentRoomId === room.id;
                const isLive = room.uid != null && liveStatusMap[String(room.uid)];
                return (
                  <div
                    key={room.id}
                    className="group overflow-hidden rounded-lg shadow-sm transition dark:ring-1 dark:ring-white/[0.06]"
                  >
                    {/* 封面区域 */}
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

                      {/* 标题覆盖层 */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-3 pt-10">
                        <div className="flex items-end justify-between gap-2">
                          {/* 左下：头像 + 名字 */}
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

                          {/* 右下：按钮 */}
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

                      {/* 左上角标题 */}
                      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/50 to-transparent px-3 pb-4 pt-2">
                        <p className="truncate text-sm font-medium text-white">{room.title}</p>
                      </div>

                      {/* 右上角：标记 */}
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
        </TabContent>
      </PageTabs>
    </section>
  );
}
