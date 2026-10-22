import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Loader2, Play, RefreshCw } from "lucide-react";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { useSettingsStore } from "@/stores/settings-store";

export interface CollectionVideo {
  bvid: string;
  title: string;
  author: string;
  cover?: string;
  duration: number;
  cid?: number | null;
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 收藏夹内容与稍后再看共用的列表页：返回、标题、计数、刷新与行样式完全一致。 */
export function VideoCollectionPage({
  title, items, total, loading, error, errorKey, playingBvid, onPlay, onRefresh,
  emptyText, emptyIcon: EmptyIcon, backTo = "/listen", backLabel = "返回听视频", footer,
}: {
  title: string;
  items: CollectionVideo[];
  total: number;
  loading: boolean;
  error: string | null;
  errorKey: number;
  playingBvid: string | null;
  onPlay: (item: CollectionVideo, index: number) => void;
  onRefresh: () => void;
  emptyText: string;
  emptyIcon: LucideIcon;
  backTo?: string;
  backLabel?: string;
  footer?: ReactNode;
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
        <button
          onClick={onRefresh}
          disabled={loading}
          className="workspace-button shrink-0"
          title="刷新"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          刷新
        </button>
      </header>

      {error && <InlineMessage key={errorKey} type="error" className="mb-3">{error}</InlineMessage>}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="app-rise rounded-lg bg-app-card p-5 shadow-sm dark:bg-app-card dark:ring-1 dark:ring-white/[0.06]">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">加载中...</div>
          ) : items.length > 0 ? (
            <>
              <div className="flex flex-col gap-2">
                {items.map((item, index) => (
                  <button
                    key={`${item.bvid}-${index}`}
                    onClick={() => onPlay(item, index)}
                    disabled={playingBvid != null}
                    className="group flex items-center gap-3 rounded-lg bg-app-card p-2.5 text-left shadow-sm transition hover:bg-ink/[0.05] disabled:cursor-not-allowed dark:bg-app-card dark:ring-1 dark:ring-white/[0.06] dark:hover:bg-[#1a1c26]"
                  >
                    {showCovers && (item.cover ? (
                      <ProxiedImage src={item.cover} alt="" className="h-11 w-[72px] shrink-0 rounded object-cover" />
                    ) : (
                      <div className="flex h-11 w-[72px] shrink-0 items-center justify-center rounded bg-brand/10 text-brand">
                        <EmptyIcon className="h-4 w-4" />
                      </div>
                    ))}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{item.title}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.author}</p>
                    </div>
                    <span className="numeric shrink-0 text-xs text-slate-400 dark:text-slate-500">{formatDuration(item.duration)}</span>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-brand transition group-hover:bg-brand/10">
                      {playingBvid === item.bvid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                ))}
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
