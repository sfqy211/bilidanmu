import { useVideoAudioStore } from "@/stores/video-audio-store";
import type { VideoPlaybackSnapshot } from "@/types/video-window";

let revision = Date.now();

export function getVideoPlaybackSnapshot(): VideoPlaybackSnapshot {
  const state = useVideoAudioStore.getState();
  const track = state.queue?.tracks[state.index];
  const video = state.video?.bvid === track?.bvid ? state.video : null;
  const cid = state.queue?.perPage ? track?.cid : video?.pages[state.pageIndex]?.cid;
  const occurrences = new Map<string, number>();
  const tracks = state.queue?.tracks.map((item) => {
    const identity = `${item.bvid}:${item.cid ?? ""}`;
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { key: `${identity}#${occurrence}`, title: item.title, bvid: item.bvid };
  }) ?? [];
  return {
    revision: ++revision,
    bvid: track?.bvid ?? null,
    aid: video?.aid ?? null,
    cid: cid ?? null,
    title: track?.title ?? "视频弹幕",
    tracks,
    index: state.index,
    playing: state.playing,
    loading: state.loading,
    currentTime: state.currentTime,
    duration: state.duration,
    volume: state.volume,
    error: state.error,
  };
}
