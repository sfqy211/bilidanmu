import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MonitorPlay, Plus, Search, Trash2 } from "lucide-react";
import { tauriCommands } from "@/lib/tauri";
import { useRoomStore } from "@/stores/room-store";
import type { Room, SearchRoomMode } from "@/types/bilibili";

const searchModes: Array<{ value: SearchRoomMode; label: string; placeholder: string }> = [
  { value: "name", label: "主播名字", placeholder: "输入主播名字搜索直播间" },
  { value: "roomId", label: "直播间号", placeholder: "输入直播间号" },
  { value: "link", label: "直播链接", placeholder: "粘贴 bilibili 直播间链接" },
  { value: "uid", label: "UID", placeholder: "输入主播 UID" }
];

function toRoom(result: {
  roomId: number;
  uid?: number;
  uname: string;
  title: string;
  cover?: string;
  isLive: boolean;
}): Room {
  return {
    id: String(result.roomId),
    roomId: result.roomId,
    uid: result.uid,
    uname: result.uname,
    title: result.title,
    cover: result.cover,
    isLive: result.isLive,
    online: result.isLive ? 12000 : 0
  };
}

export function RoomPage() {
  const { rooms, currentRoomId, searchResults, setSearchResults, addRoom, removeRoom, setCurrentRoomId } =
    useRoomStore();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchRoomMode>("name");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeholder = useMemo(
    () => searchModes.find((item) => item.value === mode)?.placeholder ?? "输入搜索内容",
    [mode]
  );

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
      setSearchResults(results.map(toRoom));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "搜索失败");
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">直播间</h2>
          <p className="mt-1 text-sm text-slate-400">添加、管理并切换当前使用的直播间。</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="grid gap-3 lg:grid-cols-[auto_1fr_auto]">
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as SearchRoomMode)}
            className="rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none"
          >
            {searchModes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/60 px-4">
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
              className="h-12 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
          </div>
          <button
            onClick={() => void handleSearch()}
            disabled={loading}
            className="rounded-xl bg-pink-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "搜索中..." : "搜索"}
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-medium">搜索结果</h3>
          <span className="text-sm text-slate-400">{searchResults.length} 个结果</span>
        </div>
        <div className="space-y-3">
          {searchResults.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/30 p-6 text-sm text-slate-500">
              暂无搜索结果，支持按主播名、直播间号、链接或 UID 查询。
            </div>
          ) : (
            searchResults.map((room) => {
              const added = rooms.some((item) => item.roomId === room.roomId);
              return (
                <div
                  key={`search-${room.roomId}`}
                  className="flex flex-col gap-4 rounded-xl border border-white/10 bg-slate-950/40 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${room.isLive ? "bg-rose-500" : "bg-slate-500"}`} />
                      <p className="truncate font-medium text-white">{room.uname}</p>
                      <span className="text-xs text-slate-400">房间号 {room.roomId}</span>
                    </div>
                    <p className="mt-2 truncate text-sm text-slate-300">{room.title}</p>
                  </div>
                  <button
                    onClick={() => addRoom(room)}
                    disabled={added}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-pink-400/30 bg-pink-500/10 px-4 py-2 text-sm text-pink-300 transition hover:bg-pink-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    {added ? "已添加" : "添加"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-medium">已添加的直播间</h3>
          <span className="text-sm text-slate-400">{rooms.length} 个房间</span>
        </div>
        <div className="space-y-3">
          {rooms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/30 p-6 text-sm text-slate-500">
              还没有添加直播间。先从上方搜索结果中添加一个。
            </div>
          ) : (
            rooms.map((room) => {
              const active = currentRoomId === room.id;
              return (
                <div
                  key={room.id}
                  className={`rounded-xl border p-4 transition ${
                    active
                      ? "border-pink-500/50 bg-pink-500/10"
                      : "border-white/10 bg-slate-950/40"
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`h-2.5 w-2.5 rounded-full ${room.isLive ? "bg-rose-500" : "bg-slate-500"}`} />
                        <p className="truncate font-medium text-white">{room.uname}</p>
                        <span className="text-xs text-slate-400">房间号 {room.roomId}</span>
                        {active ? (
                          <span className="rounded-full bg-pink-500/20 px-2 py-1 text-xs text-pink-300">当前房间</span>
                        ) : null}
                      </div>
                      <p className="mt-2 truncate text-sm text-slate-300">{room.title}</p>
                      <p className="mt-2 text-xs text-slate-400">
                        {room.isLive ? `在线中 · ${room.online?.toLocaleString() ?? "-"} 人` : "未开播"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setCurrentRoomId(room.id)}
                        className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
                      >
                        设为当前
                      </button>
                      <Link
                        to={`/room/${room.roomId}`}
                        className="inline-flex items-center gap-2 rounded-xl bg-cyan-500/20 px-4 py-2 text-sm text-cyan-300 transition hover:bg-cyan-500/30"
                      >
                        <MonitorPlay className="h-4 w-4" />
                        进入直播间
                      </Link>
                      <button
                        onClick={() => removeRoom(room.roomId)}
                        className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 px-4 py-2 text-sm text-rose-300 transition hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                        移除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
