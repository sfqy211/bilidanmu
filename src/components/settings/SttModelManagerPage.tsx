import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, ExternalLink, FolderOpen, Loader2, RefreshCw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";
import type { SttCatalogEntry, SttModelDownloadEvent } from "@/types/bilibili";
import { SettingsGroup, type SettingsPanelProps } from "./SettingsControls";
import type { SttModelsState } from "./AudioSettings";

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

/**
 * 「识别模型管理」二级页面：精选目录（友好名称 + 大小 + 说明）与已安装模型合并展示，
 * 点击已安装的模型即切换使用；未安装的可直接下载（进度内联），无需再开弹窗。
 * 手动放入目录的模型（不在精选目录中）列在「其他本地模型」。
 */
export function SttModelManagerPage({ settings, patchSettings, sttModels, onBack }: SettingsPanelProps & {
  sttModels: SttModelsState;
  onBack: () => void;
}) {
  const available = useSettingsStore((state) => state.sttAvailable);
  const { models, loading, error, setError, refresh } = sttModels;
  const [catalog, setCatalog] = useState<SttCatalogEntry[]>([]);
  const [jobs, setJobs] = useState<Record<string, JobState>>({});
  const [catalogLoading, setCatalogLoading] = useState(true);

  // 拉取精选目录 + 恢复进行中的下载任务（进度由事件补齐）
  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    tauriCommands.stt
      .listAvailableModels()
      .then((entries) => { if (!cancelled) setCatalog(entries); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
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
  }, []);

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
      if (event.status === "done") refresh();
    },
    [refresh]
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

  const openDirectory = async () => {
    try { await tauriCommands.stt.openModelDir(); }
    catch (reason) { setError(`打开模型目录失败：${String(reason)}`); }
  };

  const currentId = settings.stt.modelId;
  const selectModel = (modelId: string) => {
    patchSettings({ stt: { ...settings.stt, modelId } });
    void useSettingsStore.getState().saveSettings();
  };

  const busy = Object.values(jobs).some(
    (job) => job.status === "downloading" || job.status === "decompressing"
  );

  // 精选目录分组 + 手动安装的本地模型（不在目录中的）
  const catalogIds = new Set(catalog.map((entry) => entry.id));
  const manualModels = models.filter((id) => !catalogIds.has(id));
  const currentNotListed =
    currentId && !models.includes(currentId) && !catalogIds.has(currentId);
  if (currentNotListed) manualModels.unshift(currentId);

  const renderGroup = (title: string, entries: { entry: SttCatalogEntry; installed: boolean }[]) => {
    if (entries.length === 0) return null;
    return (
      <div key={title}>
        <p className="mb-1.5 mt-3 text-xs font-medium text-ink-muted">{title}</p>
        <div className="space-y-2">
          {entries.map(({ entry, installed }) => (
            <ManagerModelRow
              key={entry.id}
              id={entry.id}
              name={entry.description}
              sizeBytes={entry.sizeBytes}
              installed={installed}
              isCurrent={entry.id === currentId}
              job={jobs[entry.id]}
              busy={busy}
              onSelect={selectModel}
              onStart={start}
              onCancel={cancel}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button type="button" className="settings-action" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> 返回
        </button>
        <h3 className="text-[13px] font-semibold text-ink">识别模型管理</h3>
      </div>

      <SettingsGroup
        title="模型列表"
        description="流式档边说边出字延迟最低；离线档按句识别，精度显著更高、延迟 3–5 秒（自动附带 VAD）。按模型大小自行取舍：点击已安装的模型即切换为当前使用；未安装的可直接下载。"
      >
        {loading || catalogLoading ? (
          <p className="py-3 text-xs text-ink-muted" role="status">正在读取模型…</p>
        ) : (
          <>
            {renderGroup("流式 · 边说边出字",
              catalog.filter((e) => e.group === "streaming")
                .map((entry) => ({ entry, installed: models.includes(entry.id) })))}
            {renderGroup("离线 · 按句识别（高精度）",
              catalog.filter((e) => e.group === "offline")
                .map((entry) => ({ entry, installed: models.includes(entry.id) })))}
            {manualModels.length > 0 && (
              <div>
                <p className="mb-1.5 mt-3 text-xs font-medium text-ink-muted">其他本地模型</p>
                <div className="space-y-2">
                  {manualModels.map((id) => (
                    <ManagerModelRow
                      key={id}
                      id={id}
                      name={null}
                      sizeBytes={null}
                      installed={models.includes(id)}
                      isCurrent={id === currentId}
                      job={jobs[id]}
                      busy={busy}
                      onSelect={selectModel}
                      onStart={start}
                      onCancel={cancel}
                    />
                  ))}
                </div>
              </div>
            )}
            {catalog.length === 0 && models.length === 0 && (
              <p className="py-3 text-xs text-ink-muted">
                未检测到已安装的模型，可从上方目录选择一个下载安装（境内下载自动经镜像加速）。
              </p>
            )}
          </>
        )}
        {error && <p className="pt-2 text-xs text-rose-600 dark:text-rose-300" role="alert">{error}</p>}
      </SettingsGroup>

      <SettingsGroup title="模型文件">
        <div className="settings-row-block">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-ink">模型目录</p>
            <div className="flex gap-2">
              <button type="button" className="settings-action" disabled={!available} onClick={refresh}>
                <RefreshCw className="h-3.5 w-3.5" /> 刷新模型
              </button>
              <button type="button" className="settings-action" disabled={!available} onClick={() => void openDirectory()}>
                <FolderOpen className="h-3.5 w-3.5" /> 打开目录
              </button>
            </div>
          </div>
          {sttModels.modelDir && (
            <p className="mt-2 break-all select-text text-xs text-ink-muted">{sttModels.modelDir}</p>
          )}
          <details className="mt-2 text-xs leading-relaxed text-ink-muted">
            <summary className="cursor-pointer py-1">如何手动安装模型</summary>
            <p className="mt-1">
              也可将模型手动放入上述目录：每个模型使用独立子文件夹，包含 encoder、decoder、joiner 的
              ONNX 文件及 tokens.txt，放好后点击「刷新模型」。
            </p>
          </details>
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-ink-muted transition hover:text-brand"
              onClick={() => void openUrl(OFFICIAL_RELEASE_URL)}
            >
              <ExternalLink className="h-3 w-3" /> 官方模型页
            </button>
            <p className="text-xs text-ink-muted">模型来自 sherpa-onnx 官方 GitHub Release</p>
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
}

/** 模型行：友好名称/大小/完整 id + 切换（点击行）/下载进度状态机 */
function ManagerModelRow({
  id,
  name,
  sizeBytes,
  installed,
  isCurrent,
  job,
  busy,
  onSelect,
  onStart,
  onCancel,
}: {
  id: string;
  /** 精选目录里的友好名称；本地手动安装的模型为 null（直接展示 id） */
  name: string | null;
  sizeBytes: number | null;
  installed: boolean;
  isCurrent: boolean;
  job?: JobState;
  busy: boolean;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const isJobBusy = job?.status === "downloading" || job?.status === "decompressing";
  const percent = job && job.total > 0 ? Math.round((job.downloaded / job.total) * 100) : 0;
  const missing = isCurrent && !installed;

  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-2">
          <span className={`text-sm font-medium ${isCurrent ? "text-brand" : "text-ink"}`}>
            {name ?? id}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-ink-muted">
            {sizeBytes != null ? formatSize(sizeBytes) : ""}
          </span>
        </p>
        {name && <span className="mt-1 block break-all text-xs text-ink-muted">{id}</span>}
      </div>
      {isCurrent ? (
        <span
          className={`inline-flex shrink-0 items-center gap-1 text-xs ${
            missing ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {missing ? "当前使用（未找到）" : "当前使用"}
        </span>
      ) : installed ? (
        <span className="shrink-0 rounded px-2 py-1 text-xs text-ink-muted">点击切换使用</span>
      ) : isJobBusy ? (
        <button
          type="button"
          className="shrink-0 rounded px-3 py-1.5 text-xs text-ink-muted transition hover:bg-black/5 dark:hover:bg-white/[0.06]"
          onClick={(e) => { e.stopPropagation(); onCancel(id); }}
        >
          取消
        </button>
      ) : (
        <button
          type="button"
          className="shrink-0 inline-flex items-center gap-1.5 rounded bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); onStart(id); }}
        >
          <Download className="h-3.5 w-3.5" /> 下载
        </button>
      )}
    </>
  );

  const cardClass =
    `flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left transition ${
      isCurrent
        ? "border-brand/50 bg-brand/[0.06]"
        : "border-[var(--border-subtle)] hover:bg-black/5 dark:hover:bg-white/[0.04]"
    }`;

  return (
    <div>
      {installed ? (
        <button type="button" aria-pressed={isCurrent} className={cardClass} onClick={() => onSelect(id)}>
          {inner}
        </button>
      ) : (
        <div className={cardClass}>{inner}</div>
      )}

      {job && (
        <div className="mt-2 px-3">
          {job.status === "downloading" && (
            <>
              <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> 下载中
                </span>
                <span>
                  {formatSize(job.downloaded)}
                  {job.total > 0 && ` / ${formatSize(job.total)}（${percent}%）`}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/[0.06]">
                <div
                  className="h-full bg-brand transition-all"
                  style={{ width: job.total > 0 ? `${percent}%` : "100%" }}
                />
              </div>
            </>
          )}
          {job.status === "decompressing" && (
            <p className="flex items-center gap-1 text-xs text-ink-muted">
              <Loader2 className="h-3 w-3 animate-spin" /> 下载完成，解压安装中…
            </p>
          )}
          {job.status === "done" && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">安装完成，已加入模型列表</p>
          )}
          {job.status === "cancelled" && (
            <p className="text-xs text-ink-muted">已取消下载</p>
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
