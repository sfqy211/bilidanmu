import { useCallback, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Clock, ListMusic, Plus, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { tauriCommands } from "@/lib/tauri";
import type { FavFolder } from "@/types/bilibili";

/** 听视频入口页：收藏夹与「稍后再看」合并为同一个目录列表。 */
export function ListenHomePage() {
  const navigate = useNavigate();
  const [folders, setFolders] = useState<FavFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [watchLaterCount, setWatchLaterCount] = useState<number | null>(null);

  const loadFolders = useCallback(async () => {
    setFoldersLoading(true);
    setFoldersError(null);
    try {
      setFolders(await tauriCommands.video.listFavFolders());
    } catch (reason) {
      setFoldersError(reason instanceof Error ? reason.message : "获取收藏夹失败");
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  const loadWatchLaterCount = useCallback(async () => {
    try {
      setWatchLaterCount((await tauriCommands.video.listWatchLater()).length);
    } catch {
      setWatchLaterCount(null);
    }
  }, []);

  useEffect(() => {
    void loadWatchLaterCount();
  }, [loadWatchLaterCount]);

  return (
    <section
      className="flex h-full min-h-0 flex-col select-none"
      onContextMenu={(event) => { if (!import.meta.env.DEV) event.preventDefault(); }}
    >
      <PageHeader
        title="听视频"
        description="收藏夹与稍后再看；播放后可从底部播放栏回到正在播放。"
        actions={
          <NavLink to="/listen/add" className="workspace-button workspace-button-primary">
            <Plus className="h-4 w-4" />
            添加视频
          </NavLink>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div>
          <div className="app-rise mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-ink">收藏</h3>
            <button
              onClick={() => { void loadFolders(); void loadWatchLaterCount(); }}
              disabled={foldersLoading}
              className="workspace-button"
              title="刷新收藏夹"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${foldersLoading ? "animate-spin" : ""}`} />
              刷新
            </button>
          </div>

          {foldersLoading ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">加载中...</div>
          ) : foldersError ? (
            <div className="app-rise flex flex-col items-center gap-3 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              {foldersError}
              <button type="button" onClick={() => void loadFolders()} className="workspace-button">重新加载</button>
            </div>
          ) : (
            <div className="app-rise divide-y divide-subtle border-t border-subtle">
              <button
                onClick={() => navigate("/listen/watchlater")}
                className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-ink/[0.04]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Clock className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">稍后再看</span>
                {watchLaterCount != null && (
                  <span className="numeric shrink-0 text-xs text-ink-muted">{watchLaterCount} 个视频</span>
                )}
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => navigate(`/listen/fav/${folder.id}`)}
                  className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-ink/[0.04]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink/[0.05] text-ink-muted">
                    <ListMusic className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{folder.title}</span>
                  <span className="numeric shrink-0 text-xs text-ink-muted">{folder.mediaCount} 个视频</span>
                </button>
              ))}
              {!folders.length && (
                <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">还没有创建收藏夹</div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
