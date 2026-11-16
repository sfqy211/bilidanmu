import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2, RotateCcw } from "lucide-react";
import { formatClock } from "@/lib/time";

export interface VideoTimelineItem {
  id: string;
  time: number;
  end?: number;
  content: string;
}

function activeTimelineIndex(items: VideoTimelineItem[], currentTime: number) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (items[mid].time <= currentTime) low = mid + 1;
    else high = mid;
  }
  return low - 1;
}

export function VideoTimelinePane({ title, items, currentTime, loading, error, empty, fontSize, showTime, autoFollow, followKey, onSeek, onRetry }: {
  title: string;
  items: VideoTimelineItem[];
  currentTime: number;
  loading: boolean;
  error: string | null;
  empty: string;
  fontSize: number;
  showTime: boolean;
  autoFollow: boolean;
  followKey: number;
  onSeek: (time: number) => void;
  onRetry: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const paused = pausedAt === followKey;
  const active = activeTimelineIndex(items, currentTime);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => fontSize * 1.6 + 12,
    getItemKey: (index) => items[index].id,
    overscan: 8,
  });
  const activeOffset = active >= 0 ? virtualizer.getOffsetForIndex(active, "center")?.[0] : undefined;

  useEffect(() => { virtualizer.measure(); }, [fontSize, showTime, virtualizer]);
  useEffect(() => {
    if (!autoFollow || paused || active < 0) return;
    virtualizer.scrollToIndex(active, { align: "center" });
  }, [active, activeOffset, autoFollow, paused, followKey, fontSize, showTime, virtualizer]);

  return (
    <section className="video-timeline-pane" aria-label={title}>
      <header className="video-timeline-heading" data-interactive>
        <h2>{title}</h2>
        <span className="numeric">{items.length > 0 && `${items.length} 条`}</span>
        {autoFollow && paused && <button type="button" className="video-window-text-button" onClick={() => setPausedAt(null)}><RotateCcw />跟随播放</button>}
      </header>
      {loading ? <div className="video-window-empty" role="status"><Loader2 className="animate-spin" />正在加载{title}…</div>
        : error ? <div className="video-window-empty" role="status"><span>{error}</span><button type="button" data-interactive className="video-window-text-button" onClick={onRetry}>重新加载</button></div>
          : !items.length ? <div className="video-window-empty">{empty}</div>
            : <div ref={scrollRef} className="video-timeline-scroll" role="region" tabIndex={0} aria-label={`${title}时间轴`}
              onWheel={() => setPausedAt(followKey)} onTouchMove={() => setPausedAt(followKey)} onKeyDown={(event) => {
                if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) setPausedAt(followKey);
              }} onPointerDown={(event) => { if (event.target === event.currentTarget) setPausedAt(followKey); }}>
              <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
                {virtualizer.getVirtualItems().map((row) => {
                  const item = items[row.index];
                  const highlighted = row.index === active && (item.end === undefined || currentTime < item.end);
                  return <div key={row.key} data-index={row.index} ref={virtualizer.measureElement}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${row.start}px)` }}>
                    <button type="button" data-interactive className={`video-timeline-line${highlighted ? " is-current" : ""}`}
                      style={{ fontSize }} aria-current={highlighted ? "true" : undefined} title={`跳转到 ${formatClock(item.time)}`}
                      onClick={() => onSeek(item.time)}>
                      {showTime && <span className="video-timeline-time numeric">{formatClock(item.time)}</span>}
                      <span className="content-typography">{item.content}</span>
                    </button>
                  </div>;
                })}
              </div>
            </div>}
    </section>
  );
}
