import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Disc3, Loader2 } from "lucide-react";
import { VideoCollectionPage, type CollectionVideo } from "@/components/listen/VideoCollectionPage";
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
  const playQueue = useVideoAudioStore((state) => state.playQueue);

  const [resources, setResources] = useState<FavResource[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [playingBvid, setPlayingBvid] = useState<string | null>(null);
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
      onRefresh={() => void load(1, false)}
      emptyText="收藏夹是空的"
      emptyIcon={Disc3}
      footer={hasMore ? <div ref={loadMoreRef} className="flex justify-center py-3">
        {loadingMore && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div> : null}
    />
  );
}
