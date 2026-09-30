import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronDown,
  Disc3,
  Layers,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from "lucide-react";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { tauriCommands } from "@/lib/tauri";
import { useAmbientColor } from "@/hooks/useAmbientColor";
import { seasonToQueue, useVideoAudioStore, videoToQueue } from "@/stores/video-audio-store";
import { cn } from "@/lib/utils";

const LYRIC_MASK = "[mask-image:linear-gradient(to_bottom,transparent,black_14%,black_86%,transparent)]";

const formatTime = (seconds: number) => {
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
};

/** 听视频播放器页（网易云式）：左唱片、右字幕，底部控制条含切列表与评论入口。
 *  页面本身不滚动（下滑手势进评论区）；歌词视图下播放器缩为底部小横条。 */
export function VideoPlayerPage() {
  const navigate = useNavigate();
  const { bvid } = useParams();
  const {
    video,
    queue,
    index,
    playing,
    loading,
    currentTime,
    duration,
    volume,
    error,
    playVideo,
    switchQueue,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
  } = useVideoAudioStore();

  const isCurrentVideo = video?.bvid === bvid;
  const track = queue?.tracks[index];
  // 环境色：从封面提取主色，做页面顶部的沉浸渐变
  const ambientColor = useAmbientColor(isCurrentVideo ? video?.cover : undefined);

  // 直接打开本页（如刷新）且播放器没有加载该视频时：解析并自动从第一 P 播
  useEffect(() => {
    if (!bvid || isCurrentVideo) return;
    let cancelled = false;
    void (async () => {
      try {
        const info = await tauriCommands.video.getInfo(bvid);
        if (!cancelled) await playVideo(info, 0);
      } catch {
        // 错误经由 store.error 呈现
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bvid, isCurrentVideo, playVideo]);

  const currentCid = useMemo(() => {
    if (!video) return null;
    if (track?.cid != null && track.bvid === video.bvid) return track.cid;
    return video.pages[0]?.cid ?? null;
  }, [video, track]);

  // ── 字幕 ──
  const [subtitle, setSubtitle] = useState<{ loading: boolean; lines: { from: number; to: number; content: string }[] }>({
    loading: false,
    lines: [],
  });
  useEffect(() => {
    if (!video || currentCid == null) return;
    let cancelled = false;
    setSubtitle({ loading: true, lines: [] });
    void tauriCommands.video
      .getSubtitle(video.bvid, currentCid)
      .then((lines) => {
        if (!cancelled) setSubtitle({ loading: false, lines });
      })
      .catch(() => {
        if (!cancelled) setSubtitle({ loading: false, lines: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [video, currentCid]);

  const activeSubtitleIndex = useMemo(() => {
    if (subtitle.lines.length === 0) return -1;
    let active = -1;
    for (let i = 0; i < subtitle.lines.length; i++) {
      if (currentTime >= subtitle.lines[i].from) active = i;
      else break;
    }
    return active;
  }, [subtitle.lines, currentTime]);

  // ── 字幕滚动：自动跟随，手动滚动后暂停跟随 3 秒 ──
  const lyricScrollRef = useRef<HTMLDivElement>(null);
  const autoScrollLyrics = useRef(true);
  const autoScrollTimer = useRef(0);
  const pauseAutoScroll = () => {
    autoScrollLyrics.current = false;
    window.clearTimeout(autoScrollTimer.current);
    autoScrollTimer.current = window.setTimeout(() => {
      autoScrollLyrics.current = true;
    }, 3000);
  };
  useEffect(() => {
    if (activeSubtitleIndex < 0 || !autoScrollLyrics.current) return;
    const el = lyricScrollRef.current?.querySelector(`[data-line="${activeSubtitleIndex}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeSubtitleIndex]);

  // ── 歌词视图（字幕占满全屏，播放器缩为底部小横条） ──
  const [lyricsFocus, setLyricsFocus] = useState(false);
  const focusScrollRef = useRef<HTMLDivElement>(null);
  const focusAutoScroll = useRef(true);
  const focusAutoTimer = useRef(0);
  useEffect(() => {
    if (!lyricsFocus || activeSubtitleIndex < 0 || !focusAutoScroll.current) return;
    const el = focusScrollRef.current?.querySelector(`[data-line="${activeSubtitleIndex}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeSubtitleIndex, lyricsFocus]);

  // ── 可切换的队列：分 P 专辑 / 所属合集 ──
  const alternateQueues = useMemo(() => {
    if (!video) return [];
    const result: { key: string; label: string; build: () => ReturnType<typeof videoToQueue> }[] = [];
    if (video.pages.length > 1) {
      const q = videoToQueue(video);
      result.push({ key: q.key, label: `分 P（${video.pages.length}）`, build: () => videoToQueue(video) });
    }
    if (video.season && video.season.episodes.length > 0) {
      const season = video.season;
      const q = seasonToQueue(season);
      result.push({ key: q.key, label: `合集：${video.season.title}`, build: () => seasonToQueue(season) });
    }
    return result;
  }, [video]);

  const [queueMenuOpen, setQueueMenuOpen] = useState(false);

  const displayDuration = duration || track?.duration || 0;

  const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!displayDuration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    seek(((event.clientX - rect.left) / rect.width) * displayDuration);
  };

  // ── 字幕行渲染（普通面板与歌词视图共用样式逻辑） ──
  const lyricLineClass = (i: number) =>
    cn(
      "cursor-pointer transition-all duration-300 origin-left",
      i === activeSubtitleIndex
        ? "scale-[1.06] font-semibold text-brand dark:text-brand"
        : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
    );

  if (error) {
    return (
      <section className="flex h-full flex-col select-none">
        <InlineMessage type="error">{error}</InlineMessage>
      </section>
    );
  }

  if (!isCurrentVideo && !error) {
    return (
      <section className="flex h-full select-none items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在解析视频...
        </div>
      </section>
    );
  }

  if (!video || !queue || !track) {
    return (
      <section className="flex h-full select-none items-center justify-center">
        <p className="text-sm text-slate-400 dark:text-slate-500">没有加载中的视频</p>
      </section>
    );
  }

  // ═══ 歌词视图：字幕占满，播放器缩为底部小横条 ═══
  if (lyricsFocus) {
    return (
      <section
        className="flex h-full select-none flex-col overflow-hidden"
        onContextMenu={(e) => {
          if (!import.meta.env.DEV) {
            e.preventDefault();
          }
        }}
      >
        <div
          ref={focusScrollRef}
          onWheel={() => pauseAutoScroll()}
          className={cn("min-h-0 flex-1 overflow-y-auto px-10 py-6", LYRIC_MASK)}
        >
          {subtitle.lines.length === 0 ? (
            <p className="py-20 text-center text-sm text-slate-400 dark:text-slate-500">该视频暂无字幕</p>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {subtitle.lines.map((line, i) => (
                <button
                  key={`${line.from}-${i}`}
                  data-line={i}
                  onClick={() => seek(line.from)}
                  className="grid w-full grid-cols-[64px_1fr] items-baseline gap-3 text-left"
                >
                  <span className="numeric text-xs text-slate-400 dark:text-slate-500">{formatTime(line.from)}</span>
                  <span className={cn("text-[17px] leading-relaxed", lyricLineClass(i))}>{line.content}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 底部小横条播放器 */}
        <div className="relative shrink-0 border-t border-black/5 bg-app-card/95 dark:border-white/[0.06] dark:bg-app-card/95">
          {/* 迷你进度线 */}
          <div
            onClick={handleSeek}
            className="absolute inset-x-0 top-0 h-1 cursor-pointer bg-black/[0.06] dark:bg-white/[0.06]"
          >
            <div
              className="h-full bg-brand"
              style={{ width: displayDuration ? `${(currentTime / displayDuration) * 100}%` : "0%" }}
            />
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5">
            {video.cover ? (
              <ProxiedImage src={video.cover} alt="" className="h-9 w-14 shrink-0 rounded object-cover" />
            ) : (
              <div className="flex h-9 w-14 shrink-0 items-center justify-center rounded bg-brand/10 text-brand">
                <Disc3 className="h-4 w-4" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{track.title}</p>
              <p className="numeric truncate text-xs text-slate-500 dark:text-slate-400">
                {formatTime(currentTime)} / {formatTime(displayDuration)}
              </p>
            </div>
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
                className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand/90"
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
                onClick={() => setLyricsFocus(false)}
                className="ml-1 inline-flex items-center gap-1 rounded p-1.5 text-xs text-slate-400 transition hover:bg-black/5 hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-slate-200"
                title="退出歌词视图"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ═══ 常规播放器视图 ═══
  return (
    <section
      className="flex h-full select-none flex-col overflow-hidden"
      onContextMenu={(e) => {
        if (!import.meta.env.DEV) {
          e.preventDefault();
        }
      }}
    >
      {/* 环境色沉浸：封面主色自顶部向下淡出 */}
      {ambientColor && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-64 transition-opacity duration-700"
          style={{
            background: `linear-gradient(to bottom, color-mix(in srgb, ${ambientColor} 22%, transparent), transparent)`,
          }}
        />
      )}

      {error && <InlineMessage type="error" className="mb-3">{error}</InlineMessage>}

      <div className="flex min-h-0 flex-1 items-center gap-8">
        {/* 唱片 + 唱臂 */}
        <div className="relative mx-auto hidden h-64 w-64 shrink-0 sm:block">
          <div
            className="absolute -top-2 right-6 z-10 h-28 w-1.5 origin-top rounded-full bg-gradient-to-b from-slate-300 to-slate-400 shadow transition-transform duration-500 dark:from-slate-500 dark:to-slate-400"
            style={{
              transform: playing ? "rotate(12deg)" : "rotate(-18deg)",
              ...(ambientColor ? { filter: `drop-shadow(0 0 6px ${ambientColor}66)` } : null),
            }}
          >
            <div className="absolute -left-1 -top-1.5 h-4 w-4 rounded-full bg-slate-400 shadow dark:bg-slate-500" />
            <div className="absolute bottom-0 left-1/2 h-5 w-2.5 -translate-x-1/2 rounded-b bg-slate-200 dark:bg-slate-300" />
          </div>
          <div
            className={cn(
              "absolute inset-0 rounded-full shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)]",
              playing && "animate-spin [animation-duration:8s] [animation-timing-function:linear]"
            )}
            style={{
              background: "repeating-radial-gradient(circle at center, #1c1c22 0px, #1c1c22 3px, #232329 4px)",
            }}
          >
            <div className="absolute inset-[26%] overflow-hidden rounded-full ring-2 ring-black/40">
              {video.cover ? (
                <ProxiedImage src={video.cover} alt={video.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-brand/20 text-brand">
                  <Disc3 className="h-8 w-8" />
                </div>
              )}
            </div>
            <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-app-card dark:bg-app-card" />
          </div>
        </div>

        {/* 右侧：标题 + 字幕（限高、渐隐遮罩、点击 seek） */}
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 py-1">
          <div className="shrink-0">
            <h2 className="truncate text-xl font-semibold text-slate-900 dark:text-white">{track.title}</h2>
            <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
              {track.ownerName}
              <span className="text-slate-300 dark:text-slate-600"> · </span>
              {queue.title}
            </p>
          </div>

          <div className="relative min-h-0 flex-1">
            <div className="flex h-full flex-col rounded-lg bg-black/[0.03] dark:bg-white/[0.03]">
              <div className="flex shrink-0 items-center justify-between px-4 pt-2.5">
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500">字幕</p>
                <button
                  onClick={() => {
                    focusAutoScroll.current = true;
                    setLyricsFocus(true);
                  }}
                  disabled={subtitle.lines.length === 0}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-400 transition hover:bg-black/5 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/[0.06] dark:hover:text-slate-200"
                  title="歌词视图"
                >
                  <Disc3 className="h-3.5 w-3.5" />
                  歌词视图
                </button>
              </div>
              {subtitle.loading ? (
                <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-slate-400 dark:text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在加载字幕...
                </div>
              ) : subtitle.lines.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center pb-2 text-sm text-slate-400 dark:text-slate-500">
                  该视频暂无字幕
                </div>
              ) : (
                <div
                  ref={lyricScrollRef}
                  data-lyric-scroll
                  onWheel={() => pauseAutoScroll()}
                  className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2", LYRIC_MASK)}
                >
                  <div className="space-y-2.5">
                    {subtitle.lines.map((line, i) => (
                      <p
                        key={`${line.from}-${i}`}
                        data-line={i}
                        onClick={() => seek(line.from)}
                        className={cn("text-[15px] leading-relaxed", lyricLineClass(i))}
                      >
                        {line.content}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 底部控制条（不随内容滚动，固定在页面底部） */}
      <div className="shrink-0 pt-3">
        <div>
          <div
            onClick={handleSeek}
            className="group h-2 cursor-pointer rounded-full bg-black/[0.08] dark:bg-white/[0.08]"
            title="拖动进度"
          >
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-150"
              style={{ width: displayDuration ? `${(currentTime / displayDuration) * 100}%` : "0%" }}
            />
          </div>
          <div className="numeric mt-1 flex justify-between text-xs text-slate-400 dark:text-slate-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(displayDuration)}</span>
          </div>
        </div>

        <div className="mt-2 flex items-center">
          <button
            onClick={() => navigate(`/listen/video/${video.bvid}/comments`)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-500 transition hover:bg-black/5 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
            title="查看评论"
          >
            <MessageSquare className="h-4 w-4" />
            评论
          </button>

          <div className="mx-auto flex items-center gap-4">
            <button
              onClick={() => void prev()}
              disabled={index <= 0}
              className="rounded p-2 text-slate-500 transition hover:bg-black/5 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
              title="上一首"
            >
              <SkipBack className="h-5 w-5" />
            </button>
            <button
              onClick={() => void togglePlay()}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-[0_4px_16px_-4px_rgba(236,72,153,0.5)] transition hover:bg-brand/90"
              title={playing ? "暂停" : "播放"}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : playing ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </button>
            <button
              onClick={() => void next()}
              disabled={index >= queue.tracks.length - 1}
              className="rounded p-2 text-slate-500 transition hover:bg-black/5 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
              title="下一首"
            >
              <SkipForward className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {alternateQueues.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setQueueMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-500 transition hover:bg-black/5 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  title="切换播放列表"
                >
                  <Layers className="h-4 w-4" />
                  切换列表
                  <ChevronDown className={cn("h-3 w-3 transition-transform", queueMenuOpen && "rotate-180")} />
                </button>
                {queueMenuOpen && (
                  <div className="absolute bottom-full right-0 z-30 mb-2 w-56 overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black/10 dark:bg-app-card dark:ring-white/10">
                    <p className="px-3 pb-1 pt-2.5 text-[11px] text-slate-400 dark:text-slate-500">
                      当前：{queue.title}
                    </p>
                    {alternateQueues.map((item) => {
                      const isCurrent = queue.key === item.key;
                      return (
                        <button
                          key={item.key}
                          onClick={() => {
                            setQueueMenuOpen(false);
                            if (isCurrent) return;
                            if (item.key.startsWith("season-") && video.season) {
                              void switchQueue(seasonToQueue(video.season));
                            } else if (item.key.startsWith("video-")) {
                              void switchQueue(videoToQueue(video));
                            }
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-black/5 dark:hover:bg-white/[0.06]",
                            isCurrent ? "text-brand" : "text-slate-600 dark:text-slate-300"
                          )}
                        >
                          <Disc3 className="h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {isCurrent && <span className="text-[10px]">当前</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="flex w-32 items-center gap-2">
              <Volume2 className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="h-1 w-full cursor-pointer accent-brand"
                title="音量"
              />
              <span className="numeric w-7 shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">
                {volume}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
