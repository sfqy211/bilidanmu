import { useVideoAudioStore, type PlayQueue } from "@/stores/video-audio-store";
import { tauriCommands } from "@/lib/tauri";
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

/**
 * 视频列表直达弹幕模式：入队播放该视频（与列表播放按钮同一联播队列），
 * playQueue 完成时视频已解析、音频已起播，快照必有 cid，随后发布并打开独立窗口。
 * 主窗口不导航——弹幕模式开启后主窗口本就会隐藏，退出时留在原列表由 mini player 续播。
 */
export async function enterVideoDanmakuMode(album: PlayQueue, index: number): Promise<void> {
  await useVideoAudioStore.getState().playQueue(album, index);
  await tauriCommands.videoWindow.publish(getVideoPlaybackSnapshot());
  await tauriCommands.videoWindow.open();
}
