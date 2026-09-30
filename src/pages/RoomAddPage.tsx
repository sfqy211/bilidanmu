import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MonitorPlay, Plus, RefreshCw } from "lucide-react";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { PageHeader } from "@/components/layout/PageHeader";
import { tauriCommands } from "@/lib/tauri";
import { useRoomStore } from "@/stores/room-store";
import type { SearchRoomMode, SearchRoomResult } from "@/types/bilibili";

const searchModes: Array<{ value: SearchRoomMode; label: string; placeholder: string }> = [
  { value: "name", label: "主播名字", placeholder: "输入主播名字搜索直播间" },
  { value: "roomId", label: "直播间号", placeholder: "输入直播间号" },
  { value: "link", label: "直播链接", placeholder: "粘贴 bilibili 直播间链接" },
  { value: "uid", label: "UID", placeholder: "输入主播 UID" }
];

/**
 * 添加主播子页：顶部搜索框（与原内联搜索一致），结果展示在下方；
 * 未搜索时默认展示关注列表中正在直播的主播，可直接点击添加。
 * 只能通过左上角「返回」手动关闭，添加成功后不自动关闭（便于连续添加）。
 */
export function RoomAddPage() {
  const navigate = useNavigate();
  const { rooms, addRoom } = useRoomStore();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchRoomMode>("name");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchRoomResult[]>([]);
  const [followLives, setFollowLives] = useState<SearchRoomResult[]>([]);
  const [followLoading, setFollowLoading] = useState(true);
  const [addingRoomIds, setAddingRoomIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);

  const showError = (msg: string) => { setError(msg); setMsgKey((k) => k + 1); };
  const clearMessage = () => { setError(null); };

  const loadFollowLives = async (silent = false) => {
    if (!silent) setFollowLoading(true);
    try {
      const lives = await tauriCommands.room.getFollowLives();
      setFollowLives(lives);
    } catch (e) {
      if (!silent) showError(e instanceof Error ? e.message : "获取关注直播失败");
      if (!silent) setFollowLives([]);
    } finally {
      if (!silent) setFollowLoading(false);
    }
  };

  useEffect(() => {
    void loadFollowLives();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      showError("请输入搜索内容");
      return;
    }

    setLoading(true);
    clearMessage();

    try {
      const results = await tauriCommands.room.search(trimmed, mode);
      setSearchResults(results);
      setSearched(true);
    } catch (searchError) {
      showError(searchError instanceof Error ? searchError.message : "搜索失败");
      setSearchResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (roomId: number) => {
    setAddingRoomIds((prev) => new Set(prev).add(roomId));
    clearMessage();
    try {
      const roomInfo = await tauriCommands.room.add(roomId);
      addRoom(roomInfo);
      // 添加成功不关闭子页：关注列表条目会因 rooms 更新变为「已添加」
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

  // 搜索结果与关注直播共用同一行样式
  const renderRow = (room: SearchRoomResult, keyPrefix: string) => {
    const added = rooms.some((item) => item.roomId === room.roomId);
    return (
      <div
        key={`${keyPrefix}-${room.roomId}`}
        className="flex items-center gap-3 border-b border-subtle py-3"
      >
        {room.avatar ? (
          <ProxiedImage
            src={room.avatar}
            alt={room.uname}
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-medium text-brand">
            {room.uname.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{room.uname}</p>
            {room.isLive && (
              <span className="live-dot h-2 w-2 shrink-0 rounded-full bg-brand" />
            )}
          </div>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{room.title}</p>
        </div>
        <span className="numeric shrink-0 text-xs text-slate-400 dark:text-slate-500">{room.roomId}</span>
        {added ? (
          <span className="shrink-0 px-2 text-xs text-slate-400 dark:text-slate-500">已添加</span>
        ) : (
          <button
            onClick={() => void handleAdd(room.roomId)}
            disabled={addingRoomIds.has(room.roomId)}
            className="workspace-button workspace-icon-button shrink-0"
            title="添加"
            aria-label={`添加 ${room.uname}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col select-none"
      onContextMenu={(e) => {
        if (!import.meta.env.DEV) {
          e.preventDefault();
        }
      }}
    >
      <PageHeader title="添加直播间" description="搜索直播间，或从正在直播的关注中直接添加。" leading={
          <button
            onClick={() => navigate("/rooms")}
            className="workspace-button workspace-icon-button shrink-0"
            title="返回直播间列表"
            aria-label="返回直播间列表"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
      } />

      {/* 顶部搜索框（与原内联搜索一致） */}
      <div className="mb-6 border-b border-subtle pb-5">
          <div className="room-add-search flex flex-wrap gap-2">
            <select value={mode} onChange={(event) => setMode(event.target.value as SearchRoomMode)} aria-label="搜索方式" className="workspace-select h-8 shrink-0 px-3 text-[13px]">
                {searchModes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
            </select>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing && !loading) {
                  void handleSearch();
                }
              }}
              placeholder={searchModes.find((item) => item.value === mode)?.placeholder ?? "输入搜索内容"}
              aria-label="搜索内容"
              className="h-8 min-w-0 flex-1 px-3 text-[13px]"
            />
            <button
              onClick={() => void handleSearch()}
              disabled={loading}
              className="workspace-button workspace-button-primary shrink-0"
            >
              {loading ? "搜索中..." : "搜索"}
            </button>
          </div>
          {error && <InlineMessage key={msgKey} type="error" className="mt-3">{error}</InlineMessage>}
      </div>

      {/* 结果区：搜索后展示搜索结果，未搜索时默认展示正在直播的关注 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {searched ? "搜索结果" : "正在直播的关注"}
            </h3>
            <div className="flex items-center gap-2"><span className="numeric text-xs text-ink-muted">
              {searched ? `${searchResults.length} 个` : `${followLives.length} 个`}
            </span>
            {!searched && <button type="button" onClick={() => void loadFollowLives()} disabled={followLoading}
              className="workspace-button workspace-icon-button" aria-label="刷新正在直播的关注" title="刷新正在直播的关注">
              <RefreshCw className={`h-3.5 w-3.5 ${followLoading ? "animate-spin" : ""}`} />
            </button>}</div>
          </div>

          {searched ? (
            searchResults.length > 0 ? (
              <div>{searchResults.map((room) => renderRow(room, "search"))}</div>
            ) : (
              <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                没有匹配的直播间
              </div>
            )
          ) : followLoading ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">加载中...</div>
          ) : followLives.length > 0 ? (
            <div>{followLives.map((room) => renderRow(room, "follow"))}</div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              <MonitorPlay className="h-8 w-8" strokeWidth={1.6} />
              关注的主播当前没有正在直播的
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
