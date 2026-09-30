import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Play, Search as SearchIcon } from "lucide-react";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { tauriCommands } from "@/lib/tauri";
import { useVideoAudioStore, type PlayQueue } from "@/stores/video-audio-store";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import type { SearchVideoItem } from "@/types/bilibili";

const PAGE_SIZE = 20;

/** 搜索视频页：结果整表作为一张"专辑"入队，实现专辑联播 */
export function ListenSearchPage() {
  const navigate = useNavigate();
  const playQueue = useVideoAudioStore((s) => s.playQueue);
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<SearchVideoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  /** 已执行搜索的关键词（加载更多必须沿用，不能用输入框的当前值） */
  const [searchedKeyword, setSearchedKeyword] = useState("");
  const [playingBvid, setPlayingBvid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);
  const hasMoreResults = searched && items.length < total;
  const loadMoreRef = useInfiniteScroll(
    () => {
      if (!loadingMore && !loading) void load(searchedKeyword, page + 1, true);
    },
    hasMoreResults && !loading,
    items.length
  );

  const load = useCallback(
    async (kw: string, targetPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const result = await tauriCommands.video.searchVideos(kw, targetPage);
        setTotal(result.total);
        setItems((prev) => (append ? [...prev, ...result.list] : result.list));
        setPage(targetPage);
        setSearched(true);
        setSearchedKeyword(kw);
      } catch (e) {
        setError(e instanceof Error ? e.message : "搜索失败");
        setMsgKey((k) => k + 1);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  const handleSearch = () => {
    const kw = keyword.trim();
    if (!kw) {
      setError("请输入搜索关键词");
      setMsgKey((k) => k + 1);
      return;
    }
    void load(kw, 1, false);
  };

  /** 选中即听：当前搜索结果整表入队（专辑联播），从这首开始 */
  const handlePlay = async (item: SearchVideoItem, index: number) => {
    if (playingBvid) return;
    setPlayingBvid(item.bvid);
    try {
      const album: PlayQueue = {
        key: `search-${keyword.trim()}`,
        title: `搜索：${keyword.trim()}`,
        tracks: items.map((it) => ({
          bvid: it.bvid,
          cid: null,
          title: it.title,
          ownerName: it.author,
          cover: it.cover,
          duration: it.duration,
        })),
      };
      await playQueue(album, index);
      navigate(`/listen/video/${item.bvid}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "播放失败");
      setMsgKey((k) => k + 1);
    } finally {
      setPlayingBvid(null);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
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
      <header className="app-rise mb-4">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">搜索视频</h2>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
          找到的结果可以作为一张专辑连续播放
        </p>
      </header>

      <div className="app-rise mb-4 rounded-lg bg-app-card p-4 shadow-sm dark:bg-app-card dark:ring-1 dark:ring-white/[0.06]">
        <div className="flex gap-2">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSearch();
            }}
            placeholder="输入歌名、UP 主或任何关键词"
            className="h-9 flex-1 px-3 text-sm"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-medium text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
            {loading ? "搜索中..." : "搜索"}
          </button>
        </div>
        {error && <InlineMessage key={msgKey} type="error" className="mt-3">{error}</InlineMessage>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="app-rise rounded-lg bg-app-card p-5 shadow-sm dark:bg-app-card dark:ring-1 dark:ring-white/[0.06]">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">加载中...</div>
          ) : !searched ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              <SearchIcon className="h-8 w-8" strokeWidth={1.6} />
              输入关键词开始搜索
            </div>
          ) : items.length > 0 ? (
            <>
              <div className="mb-2 numeric text-xs text-slate-400 dark:text-slate-500">共 {total} 个结果</div>
              <div className="flex flex-col gap-2">
                {items.map((item, index) => (
                  <button
                    key={item.bvid}
                    onClick={() => void handlePlay(item, index)}
                    disabled={playingBvid != null}
                    className="group flex items-center gap-3 rounded-lg bg-app-card p-2.5 text-left shadow-sm transition hover:bg-ink/[0.05] disabled:cursor-not-allowed dark:bg-app-card dark:ring-1 dark:ring-white/[0.06] dark:hover:bg-[#1a1c26]"
                  >
                    {item.cover ? (
                      <ProxiedImage src={item.cover} alt="" className="h-11 w-[72px] shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-11 w-[72px] shrink-0 rounded bg-brand/10" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{item.title}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.author}</p>
                    </div>
                    <span className="numeric shrink-0 text-xs text-slate-400 dark:text-slate-500">
                      {formatDuration(item.duration)}
                    </span>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-brand transition group-hover:bg-brand/10">
                      {playingBvid === item.bvid ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </span>
                  </button>
                ))}
              </div>
              {hasMoreResults && (
                <div ref={loadMoreRef} className="flex justify-center py-3">
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                </div>
              )}
            </>
          ) : (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">没有找到相关视频</div>
          )}
        </div>
      </div>
    </section>
  );
}
