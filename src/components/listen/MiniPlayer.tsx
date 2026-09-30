import { useLocation, useNavigate } from "react-router-dom";
import { ListMusic, Loader2, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { useVideoAudioStore } from "@/stores/video-audio-store";

/** 常驻 mini 播放条：听视频后台播放时固定在主窗口底部，可控制播放/切曲/关闭 */
export function MiniPlayer() {
  const navigate = useNavigate();
  const location = useLocation();
  const { queue, index, playing, loading, togglePlay, next, prev, stop } = useVideoAudioStore();
  const playerPageActive = location.pathname.startsWith("/listen/video/");

  if (!queue || playerPageActive) return null;

  const track = queue.tracks[index];
  if (!track) return null;

  return (
    <div className="workspace-mini-player flex shrink-0 items-center gap-3 border-t border-subtle px-4 py-2">
      {track.cover ? (
        <ProxiedImage src={track.cover} alt="" className="h-9 w-14 shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-9 w-14 shrink-0 items-center justify-center rounded bg-brand/10 text-brand">
          <ListMusic className="h-4 w-4" />
        </div>
      )}
      <button
        onClick={() => navigate(`/listen/video/${track.bvid}`)}
        className="min-w-0 flex-1 text-left"
        title="打开播放页"
      >
        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{track.title}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{queue.title}</p>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => void prev()}
          disabled={index <= 0}
          className="rounded p-1.5 text-slate-500 transition hover:bg-black/5 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
          title="上一首"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          onClick={() => void togglePlay()}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-brand-contrast transition hover:opacity-90"
          title={playing ? "暂停" : "播放"}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={() => void next()}
          disabled={index >= queue.tracks.length - 1}
          className="rounded p-1.5 text-slate-500 transition hover:bg-black/5 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
          title="下一首"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <button
          onClick={() => stop()}
          className="ml-1 rounded p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/20 dark:hover:text-rose-300"
          title="停止播放"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
