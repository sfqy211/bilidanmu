import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ListMusic, Loader2, PanelsTopLeft, Pause, Play, RefreshCw } from "lucide-react";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { useSettingsStore } from "@/stores/settings-store";
import { formatClock } from "@/lib/time";

export interface CollectionVideo {
  bvid: string;
  title: string;
  author: string;
  cover?: string;
  duration: number;
  cid?: number | null;
}


/**
 * 收藏夹内容与稍后再看共用的列表页：返回、标题、计数、刷新与行样式完全一致。
 * 传 currentBvid + playing 即可把"正在播放"的那一行高亮出来。
 */
export function VideoCollectionPage({
  title, items, total, loading, error, errorKey, playingBvid, onPlay, onRefresh,
  emptyText, emptyIcon: EmptyIcon, backTo = "/listen", backLabel = "返回听视频", footer,
  onPlayAll, playingAll, currentBvid, isPlaying, onDanmaku, openingDanmakuBvid,
}: {
  title: string;
  items: CollectionVideo[];
  total: number;
  loading: boolean;
  error: string | null;
  errorKey: number;
  /** 本次点击正在加载的那一行（不是"当前播放"，那是 currentBvid） */
  playingBvid: string | null;
  onPlay: (item: CollectionVideo, index: number) => void;
  onRefresh: () => void;
  emptyText: string;
  emptyIcon: LucideIcon;
  backTo?: string;
  backLabel?: string;
  footer?: ReactNode;
  /** 播放全部（不传则不显示按钮） */
  onPlayAll?: () => void;
  playingAll?: boolean;
  /** 当前正在播放的视频 bvid，用于列表内标记 */
  currentBvid?: string | null;
  /** 当前是否真的在播（false 时标记为暂停态） */
  isPlaying?: boolean;
  /** 行内「弹幕模式」直达按钮（不传则不显示）：入队播放该视频并打开独立窗口 */
  onDanmaku?: (item: CollectionVideo, index: number) => void;
  /** 本次点击正在打开弹幕窗口的那一行 */
  openingDanmakuBvid?: string | null;
}) {
  const navigate = useNavigate();
  const showCovers = useSettingsStore((state) => state.settings.listen.showCovers);

  return (
    <section
      className="flex h-full flex-col select-none"
      onContextMenu={(event) => { if (!import.meta.env.DEV) event.preventDefault(); }}
    >
      <header className="app-rise mb-4 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(backTo)}
            className="glass-panel inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
            title={backLabel}
            aria-label={backLabel}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">{title}</h2>
            <p className="numeric mt-1 text-[13px] text-slate-500 dark:text-slate-400">共 {total} 个视频</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onPlayAll && (
            <button
              onClick={onPlayAll}
              disabled={loading || playingAll || items.length === 0}
              className="workspace-button"
              title="从第一个视频开始播放整个列表"
            >
              {playingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListMusic className="h-3.5 w-3.5" />}
              播放全部
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="workspace-button"
            title="刷新"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>
      </header>

      {error && <InlineMessage key={errorKey} type="error" className="mb-3">{error}</InlineMessage>}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="app-rise list-card">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">加载中...</div>
          ) : items.length > 0 ? (
            <>
              <div className="flex flex-col gap-2">
                {items.map((item, index) => {
                  const isCurrent = currentBvid != null && item.bvid === currentBvid;
                  const isRowLoading = playingBvid === item.bvid && playingBvid != null;
                  const rowBusy = playingBvid != null;
                  // 行内还有独立的「弹幕模式」按钮，行容器不能再用 <button>（按钮不可嵌套），
                  // 改为 div[role=button] 自带键盘激活；行内按钮 stopPropagation 避免触发播放
                  return (
                  <div
                    key={`${item.bvid}-${index}`}
                    role="button"
                    tabIndex={rowBusy ? -1 : 0}
                    aria-disabled={rowBusy || undefined}
                    onClick={() => { if (!rowBusy) onPlay(item, index); }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      if (!rowBusy) onPlay(item, index);
                    }}
                    className={`list-card-row group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                      isCurrent ? "list-card-row-current" : ""
                    } ${rowBusy ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    {showCovers && (item.cover ? (
                      <ProxiedImage src={item.cover} alt="" className="h-11 w-[72px] shrink-0 rounded object-cover" />
                    ) : (
                      <div className="flex h-11 w-[72px] shrink-0 items-center justify-center rounded bg-brand/10 text-brand">
                        <EmptyIcon className="h-4 w-4" />
                      </div>
                    ))}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{item.title}</p>
                      <p className="mt-0.5 truncate text-xs text-ink-muted">{item.author}</p>
                    </div>
                    <span className="numeric shrink-0 text-xs text-ink-muted">{formatClock(item.duration)}</span>
                    {onDanmaku && (
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); onDanmaku(item, index); }}
                        disabled={rowBusy}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-brand/10 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
                        title="播放该视频并进入弹幕模式"
                        aria-label={`播放 ${item.title} 并进入弹幕模式`}
                      >
                        {openingDanmakuBvid === item.bvid ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <PanelsTopLeft className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-brand transition group-hover:bg-brand/10">
                      {isRowLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isCurrent ? (
                        isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </span>
                  </div>
                  );
                })}
              </div>
              {footer}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              <EmptyIcon className="h-8 w-8" strokeWidth={1.6} />
              {emptyText}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
