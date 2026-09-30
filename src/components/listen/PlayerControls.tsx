import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, Layers, Loader2, MessageSquare, Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { seasonToQueue, useVideoAudioStore, videoToQueue } from "@/stores/video-audio-store";
import { cn } from "@/lib/utils";

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const mmss = `${String(Math.floor(total / 60) % 60).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  return hours ? `${hours}:${mmss}` : mmss;
}

export function PlayerControls({ onComments }: { onComments: () => void }) {
  const { video, queue, index, playing, loading, currentTime, duration, volume, togglePlay, next, prev, seek, setVolume, switchQueue } = useVideoAudioStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const alternateQueues = useMemo(() => {
    if (!video) return [];
    const options = [];
    if (video.pages.length > 1) options.push({ key: `video-${video.bvid}`, label: `分 P（${video.pages.length}）`, build: () => videoToQueue(video) });
    const season = video.season;
    if (season?.episodes.length) options.push({ key: `season-${season.id}`, label: `合集：${season.title}`, build: () => seasonToQueue(season) });
    return options;
  }, [video]);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButtonRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [menuOpen]);

  const track = queue?.tracks[index];
  if (!video || !queue || !track) return null;
  const displayDuration = duration || track.duration || 0;
  return (
    <footer className="listen-player-footer">
      <input type="range" aria-label="播放进度" min={0} max={Math.max(1, displayDuration)} step={0.1}
        value={Math.min(currentTime, displayDuration)} disabled={!displayDuration} onChange={(event) => seek(event.target.valueAsNumber)}
        className="listen-player-progress" style={{ "--listen-progress": `${displayDuration ? Math.min(100, Math.max(0, currentTime / displayDuration * 100)) : 0}%` } as CSSProperties} />
      <div className="numeric mt-1 flex justify-between text-xs text-ink-muted">
        <span>{formatTime(currentTime)}</span><span>{formatTime(displayDuration)}</span>
      </div>
      <div className="listen-player-controls">
        <button type="button" onClick={onComments} className="workspace-button listen-player-comments" title="查看评论"><MessageSquare className="h-4 w-4" />评论</button>
        <div className="listen-player-transport">
          <button type="button" onClick={() => void prev()} disabled={index <= 0} aria-label="上一首" className="workspace-button workspace-icon-button"><SkipBack className="h-5 w-5" /></button>
          <button type="button" onClick={() => void togglePlay()} aria-label={playing ? "暂停" : "播放"} className="listen-player-play">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <button type="button" onClick={() => void next()} disabled={index >= queue.tracks.length - 1} aria-label="下一首" className="workspace-button workspace-icon-button"><SkipForward className="h-5 w-5" /></button>
        </div>
        <div className="listen-player-extras">
          {alternateQueues.length > 0 && (
            <div ref={menuRef} className="relative">
              <button ref={menuButtonRef} type="button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}
                className="workspace-button workspace-icon-button" title="切换播放列表" aria-label="切换播放列表">
                <Layers className="h-4 w-4" /><span className="listen-player-queue-label">切换列表</span><ChevronDown className={cn("h-3 w-3 transition-transform", menuOpen && "rotate-180")} />
              </button>
              {menuOpen && (
                <div className="listen-player-queue-menu">
                  <p className="truncate px-3 pb-1 pt-2.5 text-xs text-ink-muted" title={queue.title}>当前：{queue.title}</p>
                  {alternateQueues.map((option) => (
                    <button type="button" key={option.key} onClick={() => { setMenuOpen(false); if (queue.key !== option.key) void switchQueue(option.build()); }}
                      className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-brand/5", queue.key === option.key ? "text-brand" : "text-ink-muted")}>
                      <Layers className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate">{option.label}</span>{queue.key === option.key && <span>当前</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="listen-player-volume">
            <Volume2 className="h-4 w-4 shrink-0 text-ink-muted" />
            <input type="range" aria-label="听视频音量" min={0} max={100} value={volume} onChange={(event) => setVolume(event.target.valueAsNumber)} className="min-w-0 flex-1 accent-brand" />
            <span className="numeric text-xs text-ink-muted">{volume}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
