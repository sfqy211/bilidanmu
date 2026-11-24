import { useTranslation as useDesktopTranslation, i18n as desktopI18n } from "@/i18n";
import { useCallback, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Clock, ListMusic, Plus, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { tauriCommands } from "@/lib/tauri";
import type { FavFolder } from "@/types/bilibili";

const collectionGrid = "grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-2.5";

/** 听视频入口页：收藏夹与「稍后再看」合并为同一个目录列表。 */
export function ListenHomePage() {
  const { t: translate } = useDesktopTranslation("desktop");
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
      setFoldersError(reason instanceof Error ? reason.message : desktopI18n.t("desktop:videoHome.failed"));
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
        title={translate("videoHome.title")}
        description={translate("videoHome.description")}
        actions={
          <NavLink to="/listen/add" className="workspace-button workspace-button-primary">
            <Plus className="h-4 w-4" />
            {translate("videoHome.add")}
          </NavLink>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div>
          <div className="app-rise mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-ink">{translate("videoHome.favorites")}</h3>
            <button
              onClick={() => { void loadFolders(); void loadWatchLaterCount(); }}
              disabled={foldersLoading}
              className="workspace-button"
              title={translate("videoHome.refreshFavorites")}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${foldersLoading ? "animate-spin" : ""}`} />
              {translate("videoHome.refresh")}
            </button>
          </div>

          {foldersLoading ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">{translate("videoHome.loading")}</div>
          ) : foldersError ? (
            <div className="app-rise flex flex-col items-center gap-3 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              {foldersError}
              <button type="button" onClick={() => void loadFolders()} className="workspace-button">{translate("videoHome.retry")}</button>
            </div>
          ) : (
            <div className="app-rise">
              <div className={`workspace-list-heading ${collectionGrid}`}>
                <span className="col-start-2">{translate("videoHome.columns.collection")}</span>
                <span className="text-right">{translate("videoHome.columns.count")}</span>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => navigate("/listen/watchlater")}
                  className={`workspace-list-row ${collectionGrid} cursor-pointer text-left`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <Clock className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 truncate text-[13px] font-medium text-ink">{translate("videoHome.watchLater")}</span>
                  {watchLaterCount != null && (
                    <span className="numeric text-right text-xs text-ink-muted">{translate("videoHome.count", { count: watchLaterCount })}</span>
                  )}
                </button>
                {folders.map((folder) => (
                  <button
                    type="button"
                    key={folder.id}
                    onClick={() => navigate(`/listen/fav/${folder.id}`)}
                    className={`workspace-list-row ${collectionGrid} cursor-pointer text-left`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink/[0.05] text-ink-muted">
                      <ListMusic className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 truncate text-[13px] font-medium text-ink">{folder.title}</span>
                    <span className="numeric text-right text-xs text-ink-muted">{translate("videoHome.count", { count: folder.mediaCount })}</span>
                  </button>
                ))}
              </div>
              {!folders.length && (
                <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">{translate("videoHome.empty")}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
