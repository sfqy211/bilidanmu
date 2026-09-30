import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Disc3, Loader2, Play } from "lucide-react";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { tauriCommands } from "@/lib/tauri";
import { useVideoAudioStore, type PlayQueue } from "@/stores/video-audio-store";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import type { FavResource } from "@/types/bilibili";

const PAGE_SIZE = 20;

/** 收藏夹内容页：夹内视频即"专辑曲目"，点选即听 */
export function ListenFavPage() {
  const navigate = useNavigate();
  const { mediaId } = useParams();
  const folderId = Number(mediaId ?? 0) || 0;
  const playQueue = useVideoAudioStore((s) => s.playQueue);

  const [resources, setResources] = useState<FavResource[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [playingBvid, setPlayingBvid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);
  const hasMoreResources = resources.length < total;
  const loadMoreRef = useInfiniteScroll(
    () => {
      if (!loadingMore && !loading) void load(page + 1, true);
    },
    hasMoreResources && !loading,
    resources.length
  );

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const result = await tauriCommands.video.listFavResources(folderId, targetPage, PAGE_SIZE);
        setTotal(result.total);
        setResources((prev) => (append ? [...prev, ...result.list] : result.list));
        setPage(targetPage);
      } catch (e) {
        setError(e instanceof Error ? e.message : "获取收藏夹内容失败");
        setMsgKey((k) => k + 1);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [folderId]
  );

  useEffect(() => {
    void load(1, false);
  }, [load]);

  /** 选中即听：收藏夹整表入队（专辑联播），从这首开始 */
  const handlePlay = async (resource: FavResource, index: number) => {
    if (playingBvid) return;
    setPlayingBvid(resource.bvid);
    try {
      const album: PlayQueue = {
        key: `fav-${folderId}`,
        title: "收藏夹",
        tracks: resources.map((it) => ({
          bvid: it.bvid,
          cid: null,
          title: it.title,
          ownerName: it.upperName,
          cover: it.cover,
          duration: it.duration,
        })),
      };
      await playQueue(album, index);
      navigate(`/listen/video/${resource.bvid}`);
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
      <header className="app-rise mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate("/listen")}
          className="glass-panel inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
          title="返回听视频"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">收藏夹内容</h2>
          <p className="mt-1 numeric text-[13px] text-slate-500 dark:text-slate-400">共 {total} 个视频</p>
        </div>
      </header>

      {error && <InlineMessage key={msgKey} type="error" className="mb-3">{error}</InlineMessage>}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="app-rise rounded-lg bg-app-card p-5 shadow-sm dark:bg-app-card dark:ring-1 dark:ring-white/[0.06]">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">加载中...</div>
          ) : resources.length > 0 ? (
            <>
              <div className="flex flex-col gap-2">
                {resources.map((resource, index) => (
                  <button
                    key={resource.bvid}
                    onClick={() => void handlePlay(resource, index)}
                    disabled={playingBvid != null}
                    className="group flex items-center gap-3 rounded-lg bg-app-card p-2.5 text-left shadow-sm transition hover:bg-ink/[0.05] disabled:cursor-not-allowed dark:bg-app-card dark:ring-1 dark:ring-white/[0.06] dark:hover:bg-[#1a1c26]"
                  >
                    {resource.cover ? (
                      <ProxiedImage
                        src={resource.cover}
                        alt=""
                        className="h-11 w-[72px] shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-[72px] shrink-0 items-center justify-center rounded bg-brand/10 text-brand">
                        <Disc3 className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{resource.title}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{resource.upperName}</p>
                    </div>
                    <span className="numeric shrink-0 text-xs text-slate-400 dark:text-slate-500">
                      {formatDuration(resource.duration)}
                    </span>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-brand transition group-hover:bg-brand/10">
                      {playingBvid === resource.bvid ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </span>
                  </button>
                ))}
              </div>
              {hasMoreResources && (
                <div ref={loadMoreRef} className="flex justify-center py-3">
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              <Disc3 className="h-8 w-8" strokeWidth={1.6} />
              收藏夹是空的
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
