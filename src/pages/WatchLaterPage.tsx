import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import { VideoCollectionPage, type CollectionVideo } from "@/components/listen/VideoCollectionPage";
import { tauriCommands } from "@/lib/tauri";
import { useVideoAudioStore, type PlayQueue } from "@/stores/video-audio-store";
import type { WatchLaterItem } from "@/types/bilibili";

/** 稍后再看：与收藏夹内容页共用同一套列表布局。 */
export function WatchLaterPage() {
  const navigate = useNavigate();
  const playQueue = useVideoAudioStore((state) => state.playQueue);
  const queueKey = useVideoAudioStore((state) => state.queue?.key ?? null);
  const currentTrack = useVideoAudioStore((state) => state.queue?.tracks[state.index] ?? null);
  const isPlaying = useVideoAudioStore((state) => state.playing);
  const [items, setItems] = useState<WatchLaterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingBvid, setPlayingBvid] = useState<string | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await tauriCommands.video.listWatchLater());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "获取稍后再看失败");
      setMsgKey((key) => key + 1);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const videos: CollectionVideo[] = items.map((item) => ({
    bvid: item.bvid,
    title: item.title,
    author: item.ownerName,
    cover: item.cover,
    duration: item.duration,
    cid: item.cid || null
  }));

  const handlePlay = async (video: CollectionVideo, index: number) => {
    if (playingBvid) return;
    setPlayingBvid(video.bvid);
    try {
      const album: PlayQueue = {
        key: "toview",
        title: "稍后再看",
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

  /** 播放全部：稍后再看是一次性全量返回的，直接整表入队从第一首播 */
  const handlePlayAll = async () => {
    if (playingAll || playingBvid || videos.length === 0) return;
    setPlayingAll(true);
    try {
      const album: PlayQueue = {
        key: "toview",
        title: "稍后再看",
        tracks: videos.map((item) => ({ bvid: item.bvid, cid: item.cid ?? null, title: item.title, ownerName: item.author, cover: item.cover, duration: item.duration }))
      };
      await playQueue(album, 0);
      navigate(`/listen/video/${videos[0].bvid}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "播放全部失败");
      setMsgKey((key) => key + 1);
    } finally {
      setPlayingAll(false);
    }
  };

  return (
    <VideoCollectionPage
      title="稍后再看"
      items={videos}
      total={videos.length}
      loading={loading}
      error={error}
      errorKey={msgKey}
      playingBvid={playingBvid}
      onPlay={(video, index) => void handlePlay(video, index)}
      onPlayAll={() => void handlePlayAll()}
      playingAll={playingAll}
      currentBvid={queueKey === "toview" ? currentTrack?.bvid ?? null : null}
      isPlaying={isPlaying}
      onRefresh={() => void load()}
      emptyText="稍后再看是空的"
      emptyIcon={Clock}
    />
  );
}
