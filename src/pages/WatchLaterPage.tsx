import { useTranslation as useDesktopTranslation, i18n as desktopI18n } from "@/i18n";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { VideoCollectionPage, type CollectionVideo } from "@/components/listen/VideoCollectionPage";
import { enterVideoDanmakuMode } from "@/lib/video-playback";
import { tauriCommands } from "@/lib/tauri";
import { useVideoAudioStore, type PlayQueue } from "@/stores/video-audio-store";
import type { WatchLaterItem } from "@/types/bilibili";

/** 稍后再看：与收藏夹内容页共用同一套列表布局。 */
export function WatchLaterPage() {
  const { t: translate } = useDesktopTranslation("desktop");
  const navigate = useNavigate();
  const playQueue = useVideoAudioStore((state) => state.playQueue);
  const queueKey = useVideoAudioStore((state) => state.queue?.key ?? null);
  const currentTrack = useVideoAudioStore((state) => state.queue?.tracks[state.index] ?? null);
  const isPlaying = useVideoAudioStore((state) => state.playing);
  const [items, setItems] = useState<WatchLaterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingBvid, setPlayingBvid] = useState<string | null>(null);
  const [openingDanmakuBvid, setOpeningDanmakuBvid] = useState<string | null>(null);
  const [removingBvid, setRemovingBvid] = useState<string | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await tauriCommands.video.listWatchLater());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : desktopI18n.t("desktop:watchLater.failed"));
      setMsgKey((key) => key + 1);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const videos: CollectionVideo[] = items.map((item) => ({
    aid: item.aid,
    bvid: item.bvid,
    title: item.title,
    author: item.ownerName,
    avatar: item.ownerAvatar,
    cover: item.cover,
    duration: item.duration,
    cid: item.cid || null
  }));

  /** 稍后再看是一次性全量返回的，三种播法共用同一张联播专辑 */
  const buildAlbum = (): PlayQueue => ({
    key: "toview",
    title: translate("watchLater.title"),
    tracks: videos.map((item) => ({ bvid: item.bvid, cid: item.cid ?? null, title: item.title, ownerName: item.author, cover: item.cover, duration: item.duration }))
  });

  const handlePlay = async (video: CollectionVideo, index: number) => {
    if (playingBvid) return;
    setPlayingBvid(video.bvid);
    try {
      await playQueue(buildAlbum(), index);
      navigate(`/listen/video/${video.bvid}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : translate("watchLater.playFailed"));
      setMsgKey((key) => key + 1);
    } finally {
      setPlayingBvid(null);
    }
  };

  /** 行内直达：入队播放该视频并直接打开弹幕窗口（不导航，退出弹幕模式时留在列表） */
  const handleDanmaku = async (video: CollectionVideo, index: number) => {
    if (openingDanmakuBvid) return;
    setOpeningDanmakuBvid(video.bvid);
    try {
      await enterVideoDanmakuMode(buildAlbum(), index);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : translate("watchLater.danmakuFailed"));
      setMsgKey((key) => key + 1);
    } finally {
      setOpeningDanmakuBvid(null);
    }
  };

  /** 从稍后再看移除：乐观更新列表，失败回滚并提示 */
  const handleRemove = async (video: CollectionVideo) => {
    if (removingBvid || !video.aid) return;
    setRemovingBvid(video.bvid);
    const snapshot = items;
    try {
      setItems((previous) => previous.filter((item) => item.bvid !== video.bvid));
      await tauriCommands.video.removeWatchLater(video.aid);
      toast.success(translate("watchLater.removed"));
    } catch (reason) {
      setItems(snapshot);
      setError(reason instanceof Error ? reason.message : translate("watchLater.removeFailed"));
      setMsgKey((key) => key + 1);
    } finally {
      setRemovingBvid(null);
    }
  };

  /** 播放全部：稍后再看是一次性全量返回的，直接整表入队从第一首播 */
  const handlePlayAll = async () => {
    if (playingAll || playingBvid || videos.length === 0) return;
    setPlayingAll(true);
    try {
      await playQueue(buildAlbum(), 0);
      navigate(`/listen/video/${videos[0].bvid}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : translate("watchLater.playAllFailed"));
      setMsgKey((key) => key + 1);
    } finally {
      setPlayingAll(false);
    }
  };

  return (
    <VideoCollectionPage
      title={translate("watchLater.title")}
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
      onDanmaku={(video, index) => void handleDanmaku(video, index)}
      openingDanmakuBvid={openingDanmakuBvid}
      onRemove={(video) => void handleRemove(video)}
      removingBvid={removingBvid}
      emptyText={translate("watchLater.empty")}
      emptyIcon={Clock}
    />
  );
}
