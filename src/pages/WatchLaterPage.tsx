import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Loader2, Play } from "lucide-react";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { tauriCommands } from "@/lib/tauri";
import { useVideoAudioStore, type PlayQueue } from "@/stores/video-audio-store";
import type { WatchLaterItem } from "@/types/bilibili";

/** 稍后再看页：列表整表作为一张专辑联播 */
export function WatchLaterPage() {
  const navigate = useNavigate();
  const playQueue = useVideoAudioStore((s) => s.playQueue);
  const [items, setItems] = useState<WatchLaterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingBvid, setPlayingBvid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await tauriCommands.video.listWatchLater());
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取稍后再看失败");
      setMsgKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePlay = async (item: WatchLaterItem, index: number) => {
    if (playingBvid) return;
    setPlayingBvid(item.bvid);
    try {
      const album: PlayQueue = {
        key: "toview",
        title: "稍后再看",
        tracks: items.map((it) => ({
          bvid: it.bvid,
          cid: it.cid || null,
          title: it.title,
          ownerName: it.ownerName,
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
      <header className="app-rise mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">稍后再看</h2>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
            整个列表作为一张专辑连续播放
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded p-1 text-xs text-slate-400 transition hover:text-slate-600 disabled:cursor-not-allowed dark:hover:text-slate-200"
          title="刷新"
        >
          <Loader2 className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          刷新
        </button>
      </header>

      {error && <InlineMessage key={msgKey} type="error" className="mb-3">{error}</InlineMessage>}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="app-rise rounded-lg bg-app-card p-5 shadow-sm dark:bg-app-card dark:ring-1 dark:ring-white/[0.06]">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">加载中...</div>
          ) : items.length > 0 ? (
            <div className="flex flex-col gap-2">
              {items.map((item, index) => (
                <button
                  key={`${item.bvid}-${index}`}
                  onClick={() => void handlePlay(item, index)}
                  disabled={playingBvid != null}
                  className="group flex items-center gap-3 rounded-lg bg-app-card p-2.5 text-left shadow-sm transition hover:bg-ink/[0.05] disabled:cursor-not-allowed dark:bg-app-card dark:ring-1 dark:ring-white/[0.06] dark:hover:bg-[#1a1c26]"
                >
                  {item.cover ? (
                    <ProxiedImage src={item.cover} alt="" className="h-11 w-[72px] shrink-0 rounded object-cover" />
                  ) : (
                    <div className="flex h-11 w-[72px] shrink-0 items-center justify-center rounded bg-brand/10 text-brand">
                      <Clock className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{item.title}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.ownerName}</p>
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
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              <Clock className="h-8 w-8" strokeWidth={1.6} />
              稍后再看是空的
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
