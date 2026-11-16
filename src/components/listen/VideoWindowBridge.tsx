import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getVideoPlaybackSnapshot } from "@/lib/video-playback";
import { tauriCommands } from "@/lib/tauri";
import { useVideoAudioStore } from "@/stores/video-audio-store";
import type { VideoPlaybackAction } from "@/types/video-window";

/** 只挂在主窗口，路由离开播放器时仍持续同步唯一播放器。 */
export function VideoWindowBridge() {
  useEffect(() => {
    const publish = () => { void tauriCommands.videoWindow.publish(getVideoPlaybackSnapshot()).catch(console.error); };
    publish();
    const unsubscribe = useVideoAudioStore.subscribe(publish);
    const unlisten = listen<{ bvid: string | null; cid: number | null; control: VideoPlaybackAction }>("video-playback-control", ({ payload }) => {
      const current = getVideoPlaybackSnapshot();
      if (current.bvid !== payload.bvid || current.cid !== payload.cid) return;
      const player = useVideoAudioStore.getState();
      const control = payload.control;
      switch (control.action) {
        case "togglePlay": void player.togglePlay(); break;
        case "seek": if (Number.isFinite(control.value)) player.seek(control.value); break;
        case "volume": if (Number.isFinite(control.value)) player.setVolume(control.value); break;
        case "selectTrack": {
          const index = current.tracks.findIndex((track) => track.key === control.value);
          if (index >= 0) void player.playTrackAt(index);
          break;
        }
      }
    });
    const unlistenLive = listen("danmaku-entered", () => {
      void tauriCommands.videoWindow.close(false).catch(console.error);
    });
    return () => { unsubscribe(); void unlisten.then((fn) => fn()); void unlistenLive.then((fn) => fn()); };
  }, []);
  return null;
}
