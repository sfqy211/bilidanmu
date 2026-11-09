import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, ExternalLink, Loader2, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { tauriCommands } from "@/lib/tauri";
import type { SttCatalogEntry, SttModelDownloadEvent } from "@/types/bilibili";

interface Props {
  open: boolean;
  onClose: () => void;
  /** 有模型下载安装完成 → 设置页刷新模型列表 */
  onInstalled: () => void;
  /** 已安装的模型 id 列表（设置页传入，用于标注） */
  installedModels: string[];
}

/** 官方模型发布页（asr-models release，含全部模型） */
const OFFICIAL_RELEASE_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models";

interface JobState {
  status: SttModelDownloadEvent["status"];
  downloaded: number;
  total: number;
  error: string | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SttModelDownloadDialog({ open, onClose, onInstalled, installedModels }: Props) {
  const [catalog, setCatalog] = useState<SttCatalogEntry[]>([]);
  const [jobs, setJobs] = useState<Record<string, JobState>>({});

  // 打开时拉取精选目录 + 恢复进行中的下载状态（进度由事件补齐）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    tauriCommands.stt
      .listAvailableModels()
      .then((entries) => { if (!cancelled) setCatalog(entries); })
      .catch(() => {});
    tauriCommands.stt
      .getDownloadStatus()
      .then((id) => {
        if (cancelled || !id) return;
        setJobs((prev) => ({
          ...prev,
          [id]: prev[id] ?? { status: "downloading", downloaded: 0, total: 0, error: null },
        }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  const handleDownloadEvent = useCallback(
    (event: SttModelDownloadEvent) => {
      setJobs((prev) => ({
        ...prev,
        [event.modelId]: {
          status: event.status,
          downloaded: event.downloaded,
          total: event.total,
          error: event.error,
        },
      }));
      if (event.status === "done") onInstalled();
    },
    [onInstalled]
  );

  useTauriEvent<SttModelDownloadEvent>("stt-model-download", handleDownloadEvent);

  const start = useCallback((modelId: string) => {
    tauriCommands.stt.startModelDownload(modelId).catch((reason) => {
      setJobs((prev) => ({
        ...prev,
        [modelId]: { status: "error", downloaded: 0, total: 0, error: String(reason) },
      }));
    });
  }, []);

  const cancel = useCallback((modelId: string) => {
    void tauriCommands.stt.cancelModelDownload(modelId);
  }, []);

  if (!open) return null;

  const busy = Object.values(jobs).some(
    (j) => j.status === "downloading" || j.status === "decompressing"
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg bg-app-surface p-5 shadow-lg dark:ring-1 dark:ring-white/[0.06]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">下载识别模型</h3>
          <button
            type="button"
            className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/[0.06] dark:hover:text-slate-300"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          流式档边说边出字延迟最低；离线档按句识别，精度显著更高、延迟 3–5 秒（自动附带 VAD）。境内下载自动经镜像加速。
        </p>

        <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
          {(["streaming", "offline"] as const).map((group) => {
            const entries = catalog.filter((e) => e.group === group);
            if (entries.length === 0) return null;
            return (
              <div key={group}>
                <p className="mb-1.5 mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {group === "streaming" ? "流式 · 边说边出字" : "离线 · 按句识别（高精度）"}
                </p>
                <div className="space-y-2">
                  {entries.map((entry) => (
              <ModelCard
                key={entry.id}
                entry={entry}
                installed={installedModels.includes(entry.id)}
                job={jobs[entry.id]}
                busy={busy}
                onStart={start}
                onCancel={cancel}
              />
                  ))}
                </div>
              </div>
            );
          })}
          {catalog.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-400" role="status">
              正在读取模型目录…
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 dark:border-white/[0.06]">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-slate-500 transition hover:text-brand dark:text-slate-400"
            onClick={() => void openUrl(OFFICIAL_RELEASE_URL)}
          >
            <ExternalLink className="h-3 w-3" /> 官方模型页
          </button>
          <p className="text-xs text-slate-400 dark:text-slate-500">模型来自 sherpa-onnx 官方 GitHub Release</p>
        </div>
      </div>
    </div>
  );
}

/** 模型卡片：名称/大小/描述 + 下载/进度/取消状态机 */
function ModelCard({
  entry,
  installed,
  job,
  busy,
  onStart,
  onCancel,
}: {
  entry: SttCatalogEntry;
  installed: boolean;
  job?: JobState;
  busy: boolean;
  onStart: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const isJobBusy = job?.status === "downloading" || job?.status === "decompressing";
  const percent = job && job.total > 0 ? Math.round((job.downloaded / job.total) * 100) : 0;

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-white/[0.06]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {entry.description}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500">
              {formatSize(entry.sizeBytes)}
            </span>
          </p>
          {/* 模型全名可能很长：单行截断，悬停由原生 title 显示完整名称 */}
          <span
            title={entry.id}
            className="mt-1 block cursor-help truncate text-xs text-slate-400 dark:text-slate-500"
          >
            {entry.id}
          </span>
        </div>
        {installed ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> 已安装
          </span>
        ) : isJobBusy ? (
          <button
            type="button"
            className="shrink-0 rounded px-3 py-1.5 text-xs text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06]"
            onClick={() => onCancel(entry.id)}
          >
            取消
          </button>
        ) : (
          <button
            type="button"
            className="shrink-0 inline-flex items-center gap-1.5 rounded bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={() => onStart(entry.id)}
          >
            <Download className="h-3.5 w-3.5" />
            下载
          </button>
        )}
      </div>

      {job && (
        <div className="mt-2">
          {job.status === "downloading" && (
            <>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> 下载中
                </span>
                <span>
                  {formatSize(job.downloaded)}
                  {job.total > 0 && ` / ${formatSize(job.total)}（${percent}%）`}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10 dark:bg-white/[0.06]">
                <div
                  className="h-full bg-brand transition-all"
                  style={{ width: job.total > 0 ? `${percent}%` : "100%" }}
                />
              </div>
            </>
          )}
          {job.status === "decompressing" && (
            <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" /> 下载完成，解压安装中…
            </p>
          )}
          {job.status === "done" && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              安装完成，已加入模型列表
            </p>
          )}
          {job.status === "cancelled" && (
            <p className="text-xs text-slate-400 dark:text-slate-500">已取消下载</p>
          )}
          {job.status === "error" && (
            <p className="text-xs text-rose-600 dark:text-rose-300" role="alert">
              {job.error ?? "下载失败"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
