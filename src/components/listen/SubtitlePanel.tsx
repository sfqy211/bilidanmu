import { useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";

export interface SubtitleLine { from: number; to: number; content: string }

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function SubtitlePanel({ lines, loading, failed, activeIndex, currentTime, focus, onFocusChange, onSeek, onRetry }: {
  lines: SubtitleLine[]; loading: boolean; failed: boolean; activeIndex: number; currentTime: number;
  focus: boolean; onFocusChange: (focus: boolean) => void; onSeek: (seconds: number) => void; onRetry: () => void;
}) {
  const preferences = useSettingsStore((state) => state.settings.listen);
  const scrollRef = useRef<HTMLDivElement>(null);
  const resumeTimer = useRef(0);
  const animationFrame = useRef(0);
  const [following, setFollowing] = useState(true);

  useEffect(() => () => window.clearTimeout(resumeTimer.current), []);
  useEffect(() => {
    if (!preferences.subtitleAutoFollow || !following || activeIndex < 0) return;
    const container = scrollRef.current;
    if (!container) return;
    const centerCurrentLine = () => {
      cancelAnimationFrame(animationFrame.current);
      const line = container.querySelector<HTMLElement>(`[data-line="${activeIndex}"]`);
      if (!line) return;
      // 只测量一次位置。新字幕从当前滚动位置接续，不排队执行旧动画。
      const start = container.scrollTop;
      const offset = line.getBoundingClientRect().top - container.getBoundingClientRect().top;
      const target = Math.min(Math.max(0, start + offset - container.clientHeight / 2 + line.clientHeight / 2),
        Math.max(0, container.scrollHeight - container.clientHeight));
      const distance = target - start;
      if (Math.abs(distance) < 1) return;
      const duration = Math.min(420, 240 + Math.abs(distance) * 0.6);
      let startedAt: number | undefined;
      const step = (now: number) => {
        startedAt ??= now;
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        container.scrollTop = start + distance * eased;
        animationFrame.current = progress < 1 ? requestAnimationFrame(step) : 0;
      };
      animationFrame.current = requestAnimationFrame(step);
    };
    centerCurrentLine();
    let width = container.clientWidth;
    let height = container.clientHeight;
    const observer = new ResizeObserver(() => {
      // ResizeObserver 首次通知不重新启动刚开始的滚动。
      if (container.clientWidth === width && container.clientHeight === height) return;
      width = container.clientWidth;
      height = container.clientHeight;
      centerCurrentLine();
    });
    observer.observe(container);
    return () => { cancelAnimationFrame(animationFrame.current); observer.disconnect(); };
  }, [activeIndex, following, focus, lines, preferences.subtitleAutoFollow, preferences.subtitleFontSize, preferences.subtitleShowTime]);

  const pauseFollowing = () => {
    if (!preferences.subtitleAutoFollow) return;
    cancelAnimationFrame(animationFrame.current);
    setFollowing(false);
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setFollowing(true), 3000);
  };
  const resumeFollowing = () => {
    window.clearTimeout(resumeTimer.current);
    setFollowing(true);
  };

  return (
    <section className="listen-subtitles" aria-label="视频字幕">
      <header className="listen-subtitle-header">
        <div className="flex min-w-0 items-center gap-3">
          <h3 className="text-xs font-medium text-ink-muted">字幕</h3>
          <span className="numeric text-xs text-ink-muted">{formatTime(currentTime)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {preferences.subtitleAutoFollow && !following && (
            <button type="button" onClick={resumeFollowing} className="workspace-button text-xs" title="恢复字幕跟随">
              <RotateCcw className="h-3.5 w-3.5" />跟随
            </button>
          )}
          <button type="button" onClick={() => onFocusChange(!focus)} disabled={!focus && !lines.length}
            className="workspace-button text-xs" aria-label={focus ? "返回封面视图" : "专注字幕"}>
            {focus ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {focus ? "返回封面" : "专注字幕"}
          </button>
        </div>
      </header>
      {loading ? (
        <div className="listen-subtitle-empty" role="status"><Loader2 className="h-4 w-4 animate-spin" />正在加载字幕…</div>
      ) : failed ? (
        <div className="listen-subtitle-empty" role="status">
          <span>暂时无法读取字幕</span><button type="button" className="workspace-button" onClick={onRetry}>重新加载</button>
        </div>
      ) : !lines.length ? (
        <div className="listen-subtitle-empty"><p>这个视频还没有字幕</p><p className="text-xs">你仍可以听音频，或查看评论。</p></div>
      ) : (
        <div ref={scrollRef} data-lyric-scroll tabIndex={0} aria-label="字幕列表"
          onWheel={pauseFollowing} onPointerDown={pauseFollowing} onKeyDown={(event) => {
            if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) pauseFollowing();
          }} className="listen-subtitle-scroll" style={{ fontSize: `${Math.min(24, Math.max(14, preferences.subtitleFontSize))}px` }}>
          <div className="listen-subtitle-lines">
            {lines.map((line, index) => (
              <button type="button" key={`${line.from}-${index}`} data-line={index}
                aria-current={index === activeIndex ? "true" : undefined}
                onClick={() => { onSeek(line.from); resumeFollowing(); }}
                className={cn("listen-subtitle-line", index === activeIndex && "listen-subtitle-current")}
                title={`跳转到 ${formatTime(line.from)}`}>
                {preferences.subtitleShowTime && <span className="listen-subtitle-time numeric">{formatTime(line.from)}</span>}
                <span className="min-w-0 break-words">{line.content}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
