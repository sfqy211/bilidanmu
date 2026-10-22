import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { PageHeader } from "@/components/layout/PageHeader";

export interface AddSearchMode {
  value: string;
  label: string;
  placeholder: string;
}

export interface AddSearchInitialSection<T> {
  title: string;
  items: T[];
  loading: boolean;
  onRefresh?: () => void;
  emptyText: string;
  icon: LucideIcon;
}

/**
 * 「添加直播间 / 添加视频」共用的搜索页：
 * 顶部模式选择 + 搜索框，下方展示搜索结果；未搜索时可展示一个默认列表。
 */
export function AddSearchPage<T>({
  title, description, backTo, backLabel, modes, defaultMode, onSearch,
  itemKey, renderRow, emptyResultText, initial, idle, externalError,
}: {
  title: string;
  description: string;
  backTo: string;
  backLabel: string;
  modes: AddSearchMode[];
  defaultMode: string;
  onSearch: (query: string, mode: string) => Promise<T[]>;
  itemKey: (item: T) => string;
  renderRow: (item: T) => ReactNode;
  emptyResultText: string;
  initial?: AddSearchInitialSection<T>;
  idle?: { text: string; icon: LucideIcon };
  externalError?: { message: string; key: number } | null;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(defaultMode);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);

  const showError = (message: string) => { setError(message); setMsgKey((key) => key + 1); };

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) { showError("请输入搜索内容"); return; }
    setLoading(true);
    setError(null);
    try {
      const found = await onSearch(trimmed, mode);
      setResults(found);
      setSearched(true);
    } catch (reason) {
      showError(reason instanceof Error ? reason.message : "搜索失败");
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const heading = searched ? "搜索结果" : initial?.title ?? "";
  const count = searched ? results.length : initial?.items.length ?? 0;
  const message = error ?? externalError?.message ?? null;
  const IdleIcon = idle?.icon;
  const InitialIcon = initial?.icon;

  return (
    <section
      className="flex h-full min-h-0 flex-col select-none"
      onContextMenu={(event) => { if (!import.meta.env.DEV) event.preventDefault(); }}
    >
      <PageHeader title={title} description={description} leading={
        <button
          onClick={() => navigate(backTo)}
          className="workspace-button workspace-icon-button shrink-0"
          title={backLabel}
          aria-label={backLabel}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      } />

      <div className="mb-6 border-b border-subtle pb-5">
        <div className="room-add-search flex flex-wrap gap-2">
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value)}
            aria-label="搜索方式"
            className="workspace-select h-8 shrink-0 px-3 text-[13px]"
          >
            {modes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing && !loading) void handleSearch();
            }}
            placeholder={modes.find((item) => item.value === mode)?.placeholder ?? "输入搜索内容"}
            aria-label="搜索内容"
            className="h-8 min-w-0 flex-1 px-3 text-[13px]"
          />
          <button
            onClick={() => void handleSearch()}
            disabled={loading}
            className="workspace-button workspace-button-primary shrink-0"
          >
            {loading ? "搜索中..." : "搜索"}
          </button>
        </div>
        {message && <InlineMessage key={`${msgKey}-${externalError?.key ?? 0}`} type="error" className="mt-3">{message}</InlineMessage>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {heading}
            </h3>
            {(searched || initial) && (
              <div className="flex items-center gap-2">
                <span className="numeric text-xs text-ink-muted">{count} 个</span>
                {!searched && initial?.onRefresh && (
                  <button
                    type="button"
                    onClick={initial.onRefresh}
                    disabled={initial.loading}
                    className="workspace-button workspace-icon-button"
                    aria-label={`刷新${initial.title}`}
                    title={`刷新${initial.title}`}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${initial.loading ? "animate-spin" : ""}`} />
                  </button>
                )}
              </div>
            )}
          </div>

          {searched ? (
            results.length > 0 ? (
              <div>{results.map((item) => <div key={itemKey(item)}>{renderRow(item)}</div>)}</div>
            ) : (
              <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">{emptyResultText}</div>
            )
          ) : initial ? (
            initial.loading ? (
              <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">加载中...</div>
            ) : initial.items.length > 0 ? (
              <div>{initial.items.map((item) => <div key={itemKey(item)}>{renderRow(item)}</div>)}</div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                {InitialIcon && <InitialIcon className="h-8 w-8" strokeWidth={1.6} />}
                {initial.emptyText}
              </div>
            )
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-slate-400 dark:text-slate-500">
              {IdleIcon && <IdleIcon className="h-8 w-8" strokeWidth={1.6} />}
              {idle?.text}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
