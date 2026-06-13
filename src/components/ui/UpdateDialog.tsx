import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Download, Zap, Loader2 } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { tauriCommands } from "@/lib/tauri";
import type { UpdateInfo } from "@/types/bilibili";

/** GitHub Release 下载加速代理（大陆可访问） */
const CDN_MIRROR_PREFIX = "https://ghfast.top/";

function cdnUrl(githubUrl: string): string {
  return CDN_MIRROR_PREFIX + githubUrl;
}

interface UpdateDialogProps {
  updateInfo: UpdateInfo | null;
  onDismiss: () => void;
}

export function UpdateDialog({ updateInfo, onDismiss }: UpdateDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState({ downloaded: 0, total: 0 });
  const [downloadedFile, setDownloadedFile] = useState<{ path: string; name: string } | null>(null);

  useEffect(() => {
    if (!updateInfo) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [updateInfo, onDismiss]);

  useEffect(() => {
    if (!updateInfo) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [updateInfo, onDismiss]);

  // 监听下载进度
  useEffect(() => {
    if (!downloading) return;
    const unlisten = listen<{ downloaded: number; total: number }>(
      "download-progress",
      (event) => {
        setProgress(event.payload);
      }
    );
    return () => { void unlisten.then((fn) => fn()); };
  }, [downloading]);

  const changelogHtml = useMemo(
    () => (updateInfo?.changelog ? DOMPurify.sanitize(marked.parse(updateInfo.changelog, { async: false })) : ""),
    [updateInfo?.changelog]
  );

  const handleDownload = useCallback(async (url: string, filename: string) => {
    setDownloading(filename);
    setProgress({ downloaded: 0, total: 0 });
    setDownloadedFile(null);
    try {
      const filePath = await tauriCommands.update.download(url, filename);
      setDownloadedFile({ path: filePath, name: filename });
    } catch (e) {
      console.error("下载失败:", e);
    } finally {
      setDownloading(null);
    }
  }, []);

  const handleOpenFile = useCallback(async () => {
    if (!downloadedFile) return;
    try {
      await tauriCommands.update.openFile(downloadedFile.path);
      onDismiss();
    } catch (e) {
      console.error("打开文件失败:", e);
    }
  }, [downloadedFile, onDismiss]);

  if (!updateInfo) return null;

  const windowsAssets = updateInfo.assets.filter(
    (a) => a.name.endsWith(".exe") || a.name.endsWith(".msi") || a.name.endsWith(".zip")
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isDownloading = downloading !== null;
  const downloadPercent = progress.total > 0 ? Math.round((progress.downloaded / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        ref={dialogRef}
        className="flex w-full max-w-md flex-col rounded-lg bg-[#f8f8f8] p-6 shadow-lg dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]"
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          发现新版本 v{updateInfo.latestVersion}
        </h3>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          当前版本 v{updateInfo.currentVersion}
          {updateInfo.publishedAt && (
            <> · {new Date(updateInfo.publishedAt).toLocaleDateString("zh-CN")}</>
          )}
        </p>

        <div
          className="update-changelog mt-4 max-h-48 overflow-y-auto rounded bg-[#f0f0f0] p-3 text-sm text-slate-600 dark:bg-[#0e1018] dark:text-slate-300"
          dangerouslySetInnerHTML={{ __html: changelogHtml }}
        />

        {/* 下载进度 */}
        {isDownloading && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                下载中 {downloading}
              </span>
              <span>
                {formatSize(progress.downloaded)}
                {progress.total > 0 && ` / ${formatSize(progress.total)}`}
                {progress.total > 0 && ` (${downloadPercent}%)`}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10 dark:bg-white/[0.06]">
              <div
                className="h-full bg-pink-500 transition-all"
                style={{ width: progress.total > 0 ? `${downloadPercent}%` : "100%" }}
              />
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {/* 下载完成后显示打开按钮 */}
          {downloadedFile ? (
            <>
              <button
                onClick={() => void handleOpenFile()}
                className="inline-flex items-center gap-1.5 rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-400"
              >
                <Download className="h-4 w-4" />
                打开 {downloadedFile.name}
              </button>
              <button
                onClick={() => setDownloadedFile(null)}
                className="rounded px-4 py-2 text-sm text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.04]"
              >
                重新下载
              </button>
            </>
          ) : !isDownloading && windowsAssets.length > 0 ? (
            windowsAssets.map((asset) => (
              <div key={asset.name} className="flex gap-1.5">
                <button
                  onClick={() => void handleDownload(cdnUrl(asset.downloadUrl), asset.name)}
                  disabled={isDownloading}
                  className="inline-flex items-center gap-1.5 rounded bg-pink-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Zap className="h-4 w-4" />
                  {asset.name.endsWith(".exe") ? "EXE 加速" : asset.name.endsWith(".msi") ? "MSI 加速" : "ZIP 加速"}
                </button>
                <button
                  onClick={() => void handleDownload(asset.downloadUrl, asset.name)}
                  disabled={isDownloading}
                  className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.06] dark:text-slate-300 dark:hover:bg-white/[0.04]"
                >
                  <Download className="h-4 w-4" />
                  GitHub
                </button>
              </div>
            ))
          ) : !isDownloading ? (
            <a
              href={updateInfo.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded bg-pink-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-pink-400"
            >
              <ExternalLink className="h-4 w-4" />
              前往 GitHub 下载
            </a>
          ) : null}
          <button
            onClick={onDismiss}
            disabled={isDownloading}
            className="ml-auto rounded px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-300 dark:hover:bg-white/[0.04]"
          >
            稍后提醒
          </button>
        </div>
      </div>
    </div>
  );
}
