import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Disc3, Loader2 } from "lucide-react";
import { VideoCollectionPage, type CollectionVideo } from "@/components/listen/VideoCollectionPage";
import { tauriCommands } from "@/lib/tauri";
import { useVideoAudioStore, type PlayQueue } from "@/stores/video-audio-store";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import type { FavResource } from "@/types/bilibili";

const PAGE_SIZE = 20;
/** 拉全量时的分页大小：Rust 侧单页上限 50 */
const BULK_PAGE_SIZE = 50;

/** 收藏夹内容页：夹内视频即"专辑曲目"，点选即听 */
export function ListenFavPage() {
  const navigate = useNavigate();
  const { mediaId } = useParams();
  const folderId = Number(mediaId ?? 0) || 0;
  const playQueue = useVideoAudioStore((state) => state.playQueue);
  // 列表标记：当前播放曲目（可能来自别的列表，key 不匹配则不标记）
  const queueKey = useVideoAudioStore((state) => state.queue?.key ?? null);
  const currentTrack = useVideoAudioStore((state) => state.queue?.tracks[state.index] ?? null);
  const isPlaying = useVideoAudioStore((state) => state.playing);

  const [resources, setResources] = useState<FavResource[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [playingBvid, setPlayingBvid] = useState<string | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);

  const hasMore = resources.length < total;
  const loadMoreRef = useInfiniteScroll(
    () => { if (!loadingMore && !loading) void load(page + 1, true); },
    hasMore && !loading,
    resources.length
  );

  const load = useCallback(async (targetPage: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const result = await tauriCommands.video.listFavResources(folderId, targetPage, PAGE_SIZE);
      setTotal(result.total);
      setResources((prev) => (append ? [...prev, ...result.list] : result.list));
      setPage(targetPage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "获取收藏夹内容失败");
      setMsgKey((key) => key + 1);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [folderId]);

  useEffect(() => {
    void load(1, false);
  }, [load]);

  const videos: CollectionVideo[] = resources.map((item) => ({
    bvid: item.bvid,
    title: item.title,
    author: item.upperName,
    cover: item.cover,
    duration: item.duration,
    cid: null
  }));

  /** 选中即听：收藏夹整表入队（专辑联播），从这首开始 */
  const handlePlay = async (video: CollectionVideo, index: number) => {
    if (playingBvid) return;
    setPlayingBvid(video.bvid);
    try {
      const album: PlayQueue = {
        key: `fav-${folderId}`,
        title: "收藏夹",
        tracks: videos.map((item) => ({ bvid: item.bvid, cid: item.cid ?? null, title: item.title, ownerName: item.author, cover: item.cover, duration: item.duration }))
      };
      await playQueue(album, index);
      navigate(`/listen/video/${video.bvid}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "播放失败");
      setMsgKey((key) => key + 1);
    } finally {
      setPlayingBvid(null);
    }
  };

  /** 播放全部：先把整个收藏夹拉全（列表可能只滚动加载了一部分），再从第一首播 */
  const handlePlayAll = async () => {
    if (playingAll || playingBvid) return;
    setPlayingAll(true);
    try {
      // 已加载的足够多时直接用；否则按 50/页补拉剩余部分
      let all = resources;
      if (all.length < total) {
        const collected = [...all];
        let pageNo = Math.floor(all.length / BULK_PAGE_SIZE) + 1;
        while (collected.length < total) {
          const result = await tauriCommands.video.listFavResources(folderId, pageNo, BULK_PAGE_SIZE);
          if (result.list.length === 0) break;
          collected.push(...result.list);
          pageNo += 1;
        }
        all = collected;
        setResources(all);
        setTotal(Math.max(total, all.length));
      }
      if (all.length === 0) return;
      const album: PlayQueue = {
        key: `fav-${folderId}`,
        title: "收藏夹",
        tracks: all.map((item) => ({ bvid: item.bvid, cid: null, title: item.title, ownerName: item.upperName, cover: item.cover, duration: item.duration }))
      };
      await playQueue(album, 0);
      navigate(`/listen/video/${all[0].bvid}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "播放全部失败");
      setMsgKey((key) => key + 1);
    } finally {
      setPlayingAll(false);
    }
  };

  // 仅当当前队列就是本收藏夹时才标记，避免别的列表在播时误标
  const isThisQueue = queueKey === `fav-${folderId}`;

  return (
    <VideoCollectionPage
      title="收藏夹内容"
      items={videos}
      total={total}
      loading={loading}
      error={error}
      errorKey={msgKey}
      playingBvid={playingBvid}
      onPlay={(video, index) => void handlePlay(video, index)}
      onPlayAll={() => void handlePlayAll()}
      playingAll={playingAll}
      currentBvid={isThisQueue ? currentTrack?.bvid ?? null : null}
      isPlaying={isPlaying}
      onRefresh={() => void load(1, false)}
      emptyText="收藏夹是空的"
      emptyIcon={Disc3}
      footer={hasMore ? <div ref={loadMoreRef} className="flex justify-center py-3">
        {loadingMore && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div> : null}
    />
  );
}
