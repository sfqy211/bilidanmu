import { useTranslation as useDesktopTranslation } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

export interface SubtitleLine { from: number; to: number; content: string }

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export interface SubtitlePanelAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function SubtitlePanel({
  lines, loading, failed, activeIndex, currentTime, onSeek, onRetry,
  badge, emptyTitle, emptyHint, action, statusText, onStop, onRestart, errorText,
}: {
  lines: SubtitleLine[]; loading: boolean; failed: boolean; activeIndex: number; currentTime: number;
  onSeek: (seconds: number) => void; onRetry: () => void;
  /** 标题旁的来源标记，例如「AI 生成」 */
  badge?: string;
  emptyTitle?: string;
  emptyHint?: string;
  /** 空态主操作（语音识别生成 / 前往设置等） */
  action?: SubtitlePanelAction;
  /** 识别进度等状态文案（列表已有内容时显示在标题栏） */
  statusText?: string | null;
  /** 识别中显示「停止」 */
  onStop?: () => void;
  /** 已有生成结果时显示「重新识别」 */
  onRestart?: () => void;
  errorText?: string | null;
}) {
  const { t: translate } = useDesktopTranslation("desktop");
  const preferences = useSettingsStore((state) => state.settings.listen);
  const reducedMotion = useReducedMotion();
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
      if (reducedMotion) { container.scrollTop = target; return; }
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
    let contentHeight = container.scrollHeight;
    const observer = new ResizeObserver(() => {
      // ResizeObserver 首次通知不重新启动刚开始的滚动。
      if (container.clientWidth === width && container.clientHeight === height && container.scrollHeight === contentHeight) return;
      width = container.clientWidth;
      height = container.clientHeight;
      contentHeight = container.scrollHeight;
      centerCurrentLine();
    });
    observer.observe(container);
    if (container.firstElementChild) observer.observe(container.firstElementChild);
    return () => { cancelAnimationFrame(animationFrame.current); observer.disconnect(); };
  }, [activeIndex, following, lines, reducedMotion, preferences.subtitleAutoFollow, preferences.subtitleFontSize, preferences.subtitleShowTime]);

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
    <section className="listen-subtitles" aria-label={translate("subtitles.video")}>
      <header className="listen-subtitle-header">
        <div className="flex min-w-0 items-center gap-3">
          <h3 className="text-xs font-medium text-ink-muted">{translate("subtitles.title")}</h3>
          {badge && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              {badge}
            </span>
          )}
          <span className="numeric text-xs text-ink-muted">{formatTime(currentTime)}</span>
          {lines.length > 0 && statusText && <span className="truncate text-xs text-ink-muted">{statusText}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {statusText && onStop && (
            <button type="button" onClick={onStop} className="workspace-button text-xs">{translate("subtitles.stop")}</button>
          )}
          {!statusText && onRestart && (
            <button type="button" onClick={onRestart} className="workspace-button text-xs" title={translate("subtitles.regenerateHint")}>
              {translate("subtitles.regenerate")}
            </button>
          )}
          {preferences.subtitleAutoFollow && !following && (
            <button type="button" onClick={resumeFollowing} className="workspace-button text-xs" title={translate("subtitles.followHint")}>
              <RotateCcw className="h-3.5 w-3.5" />{translate("subtitles.follow")}
            </button>
          )}
        </div>
      </header>
      {loading ? (
        <div className="listen-subtitle-empty" role="status"><Loader2 className="h-4 w-4 animate-spin" />{translate("subtitles.loading")}</div>
      ) : !lines.length ? (
        <div className="listen-subtitle-empty" role="status">
          {failed ? (
            <><span>{translate("subtitles.failed")}</span><button type="button" className="workspace-button" onClick={onRetry}>{translate("subtitles.reload")}</button></>
          ) : (
            <>
              <p>{emptyTitle ?? translate("subtitles.empty")}</p>
              {emptyHint && <p className="text-xs">{emptyHint}</p>}
            </>
          )}
          {statusText && <p className="text-xs">{statusText}</p>}
          {errorText && <p className="max-w-[80%] text-xs text-rose-500">{errorText}</p>}
          {action && (
            <button type="button" className="workspace-button" disabled={action.disabled} onClick={action.onClick}>
              {action.label}
            </button>
          )}
        </div>
      ) : (
        <div ref={scrollRef} data-lyric-scroll tabIndex={0} aria-label={translate("subtitles.list")}
          onWheel={pauseFollowing} onPointerDown={pauseFollowing} onKeyDown={(event) => {
            if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) pauseFollowing();
          }} className="listen-subtitle-scroll" style={{ fontSize: `${Math.min(24, Math.max(14, preferences.subtitleFontSize))}px` }}>
          <div className="listen-subtitle-lines">
            {lines.map((line, index) => (
              <button type="button" key={`${line.from}-${index}`} data-line={index}
                aria-current={index === activeIndex ? "true" : undefined}
                onClick={() => { onSeek(line.from); resumeFollowing(); }}
                className={cn("listen-subtitle-line", index === activeIndex && "listen-subtitle-current")}
                title={translate("subtitles.seek", { value: formatTime(line.from) })}>
                {preferences.subtitleShowTime && <span className="listen-subtitle-time numeric">{formatTime(line.from)}</span>}
                <span className="content-typography min-w-0 break-words">{line.content}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
