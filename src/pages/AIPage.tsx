import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brain,
  Check,
  Clock,
  Copy,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { tauriCommands } from "@/lib/tauri";
import type { AiPermissionMode, McpStatus } from "@/types/ai";
import type { Room } from "@/types/bilibili";

const WATCH_MINUTES: Array<{ value: number; label: string }> = [
  { value: 60, label: "1 小时" },
  { value: 120, label: "2 小时" },
  { value: 240, label: "4 小时" },
  { value: 480, label: "8 小时" },
  { value: 0, label: "不限" },
];

const MODES: Array<{ value: AiPermissionMode; label: string; description: string }> = [
  {
    value: "confirmAll",
    label: "变更前确认",
    description: "执行任何非只读操作前都询问你",
  },
  {
    value: "autonomous",
    label: "自主模式",
    description: "只读与普通写直通；发弹幕、送礼、发评论等有风险的操作需确认",
  },
  {
    value: "full",
    label: "完全访问",
    description: "全部自动执行，不再询问，包括送礼等真实扣费操作",
  },
];

function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`workspace-dialog flex max-h-[85vh] w-full flex-col rounded-lg bg-app-surface p-6 shadow-lg dark:bg-app-surface dark:ring-1 dark:ring-white/[0.06] ${
          wide ? "max-w-2xl" : "max-w-lg"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ink-muted transition hover:bg-ink/[0.06] hover:text-ink"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function AIPage() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [mode, setMode] = useState<AiPermissionMode>("autonomous");
  const [watchMinutes, setWatchMinutes] = useState(240);
  const [memoryRooms, setMemoryRooms] = useState<Room[]>([]);
  const [memoryScope, setMemoryScope] = useState("global");
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryMeta, setMemoryMeta] = useState<{ chars: number; updatedAt: number } | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memorySaved, setMemorySaved] = useState(false);
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [mcpStatus, permissionMode, watchMaxMinutes] = await Promise.all([
        tauriCommands.ai.mcpStatus(),
        tauriCommands.ai.getPermissionMode(),
        tauriCommands.ai.getWatchMaxMinutes(),
      ]);
      setStatus(mcpStatus);
      setMode(permissionMode);
      setWatchMinutes(watchMaxMinutes);
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void tauriCommands.state.getRooms().then(setMemoryRooms).catch(() => {});
  }, []);

  const loadMemory = useCallback(async (scopeValue: string) => {
    const global = scopeValue === "global";
    try {
      const entry = await tauriCommands.ai.memoryGet(
        global ? "global" : "room",
        global ? undefined : Number(scopeValue),
      );
      setMemoryContent(entry?.content ?? "");
      setMemoryMeta(entry ? { chars: entry.chars, updatedAt: entry.updatedAt } : null);
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  useEffect(() => {
    void loadMemory(memoryScope);
  }, [memoryScope, loadMemory]);

  const saveMemory = async () => {
    if (!memoryContent.trim()) {
      setError("记忆内容不能为空；要清空请用「删除」");
      return;
    }
    setMemoryBusy(true);
    setError(null);
    try {
      const global = memoryScope === "global";
      const entry = await tauriCommands.ai.memorySet(
        global ? "global" : "room",
        global ? undefined : Number(memoryScope),
        memoryContent,
      );
      setMemoryMeta({ chars: entry.chars, updatedAt: entry.updatedAt });
      setMemorySaved(true);
      setTimeout(() => setMemorySaved(false), 1500);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setMemoryBusy(false);
    }
  };

  const deleteMemory = async () => {
    if (!window.confirm("删除这段记忆？删除后无法恢复。")) return;
    setMemoryBusy(true);
    setError(null);
    try {
      const global = memoryScope === "global";
      await tauriCommands.ai.memoryDelete(
        global ? "global" : "room",
        global ? undefined : Number(memoryScope),
      );
      setMemoryContent("");
      setMemoryMeta(null);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setMemoryBusy(false);
    }
  };

  useTauriEvent<AiPermissionMode>("ai-permission-changed", (next) => {
    setMode(next);
  });

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("复制失败：剪贴板不可用");
    }
  };

  const loadToken = async () => {
    try {
      setToken(await tauriCommands.ai.mcpToken());
    } catch (reason) {
      setError(String(reason));
    }
  };

  const toggleServer = async (start: boolean) => {
    setBusy(true);
    try {
      setStatus(start ? await tauriCommands.ai.mcpStart() : await tauriCommands.ai.mcpStop());
      if (start) await loadToken();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      setToken(await tauriCommands.ai.mcpRegenerateToken());
      setCopied(null);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const selectMode = async (next: AiPermissionMode) => {
    setBusy(true);
    try {
      await tauriCommands.ai.setPermissionMode(next);
      setMode(next);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const selectWatchMinutes = async (minutes: number) => {
    setBusy(true);
    try {
      await tauriCommands.ai.setWatchMaxMinutes(minutes);
      setWatchMinutes(minutes);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const clientConfig = useMemo(() => {
    if (!status?.endpoint) return "";
    return JSON.stringify(
      {
        mcpServers: {
          bilidanmu: {
            type: "http",
            url: status.endpoint,
            headers: { Authorization: `Bearer ${token ?? "<点击下方显示 token>"}` },
          },
        },
      },
      null,
      2,
    );
  }, [status?.endpoint, token]);

  return (
    <section className="flex h-full min-h-0 select-none flex-col">
      <PageHeader
        title="AI 接入"
        description="把本应用的能力通过 MCP 暴露给外部 AI 客户端。"
        actions={
          <button
            type="button"
            className="settings-action inline-flex items-center gap-1.5"
            onClick={() => void refresh()}
            disabled={busy}
          >
            <RefreshCw className="h-3.5 w-3.5" />刷新
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        {error && (
          <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" role="alert">
            {error}
          </p>
        )}

        {/* ── MCP 服务概览 ─────────────────────────────────── */}
        <section className="border-t border-subtle py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-[13px] font-medium text-ink">
                <Terminal className="h-4 w-4" />MCP 服务
              </h3>
              <p className="mt-1 text-xs text-ink-muted">
                {status?.running
                  ? `运行中 · ${status.endpoint}`
                  : status?.error
                    ? status.error
                    : "未运行"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="settings-action inline-flex items-center gap-1.5"
                onClick={() => setMcpDialogOpen(true)}
              >
                <Settings2 className="h-3.5 w-3.5" />配置
              </button>
              <button
                type="button"
                className="settings-action shrink-0"
                disabled={busy}
                onClick={() => void toggleServer(!status?.running)}
              >
                {status?.running ? "停止" : "启动"}
              </button>
            </div>
          </div>
        </section>

        {/* ── 权限模式概览 ─────────────────────────────────── */}
        <section className="border-t border-subtle py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-[13px] font-medium text-ink">
                <ShieldCheck className="h-4 w-4" />权限模式
              </h3>
              <p className="mt-1 text-xs text-ink-muted">
                当前：{MODES.find((item) => item.value === mode)?.label ?? mode}
                {" · "}
                {MODES.find((item) => item.value === mode)?.description}
              </p>
            </div>
            <button
              type="button"
              className="settings-action inline-flex shrink-0 items-center gap-1.5"
              onClick={() => setPermissionDialogOpen(true)}
            >
              <Settings2 className="h-3.5 w-3.5" />修改
            </button>
          </div>
        </section>

        {/* ── 长会话 ─────────────────────────────────────── */}
        <section className="border-t border-subtle py-5">
          <h3 className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <Clock className="h-4 w-4" />长会话保底时长
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            AI 可以开一条后台会话持续接收某个直播间的弹幕（最多 3 路并发），主播下播或手动停止即结束。
            这里设置会话最长保留多久，到点自动收尾，已收到的弹幕仍可读取。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {WATCH_MINUTES.map((item) => {
              const active = watchMinutes === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  disabled={busy}
                  onClick={() => void selectWatchMinutes(item.value)}
                  aria-pressed={active}
                  className={
                    active
                      ? "rounded-md border border-brand/30 bg-brand/10 px-3 py-1.5 text-[12px] font-medium text-brand"
                      : "rounded-md border border-subtle px-3 py-1.5 text-[12px] text-ink-muted hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-ink-muted">
            单个会话的缓冲上限由 AI 调用时指定（默认 2 万条）；「不限」只表示不加时长上限，会话仍会在主播下播时结束。
          </p>
        </section>

        {/* ── 直播记忆 ───────────────────────────────────── */}
        <section className="border-t border-subtle py-5">
          <h3 className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <Brain className="h-4 w-4" />直播记忆
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            AI 会在总结后自行维护记忆；这里可以查看和手动修改。房间记忆按房间号保存，
            全局记忆对所有直播间生效，每个范围最多 8000 字。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="settings-select-wrap" style={{ width: 240 }}>
              <Select value={memoryScope} onValueChange={setMemoryScope}>
                <SelectTrigger aria-label="记忆范围" className="settings-select-trigger" />
                <SelectContent>
                  <SelectItem value="global">全局记忆</SelectItem>
                  {memoryRooms.map((room) => (
                    <SelectItem key={room.roomId} value={String(room.roomId)}>
                      {room.roomId} · {room.uname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {memoryMeta && (
              <span className="text-[11px] text-ink-muted">
                更新于 {new Date(memoryMeta.updatedAt * 1000).toLocaleString()}
              </span>
            )}
          </div>
          <textarea
            rows={8}
            value={memoryContent}
            onChange={(event) => setMemoryContent(event.target.value)}
            placeholder={`例如：
- 直播风格与常聊话题
- 观众称呼、常用梗与需要注意的雷点
- 值得长期记住的约定或偏好`}
            className="mt-2 w-full resize-y rounded-md border border-subtle bg-transparent px-3 py-2 text-[12px] leading-relaxed text-ink outline-none focus:border-brand/50"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="numeric text-[11px] text-ink-muted">{memoryContent.length} / 8000 字</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={memoryBusy}
                onClick={() => void deleteMemory()}
                className="rounded-md border border-subtle px-3 py-1.5 text-[12px] text-ink-muted hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10"
              >
                删除
              </button>
              <button
                type="button"
                disabled={memoryBusy}
                onClick={() => void saveMemory()}
                className="workspace-button"
              >
                {memorySaved ? "已保存" : "保存"}
              </button>
            </div>
          </div>
        </section>
      </div>

      {mcpDialogOpen && (
        <Modal title="MCP 配置" onClose={() => setMcpDialogOpen(false)} wide>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-ink-muted">
                  {status?.running
                    ? `运行中 · ${status.endpoint}`
                    : status?.error
                      ? status.error
                      : "未运行"}
                </p>
                <p className="mt-1 text-[11px] text-ink-muted">
                  streamable HTTP，本机固定端口 23332；启动后会生成访问 token。
                </p>
              </div>
              <button
                type="button"
                className="settings-action shrink-0"
                disabled={busy}
                onClick={() => void toggleServer(!status?.running)}
              >
                {status?.running ? "停止" : "启动"}
              </button>
            </div>

            {status?.running && (
              <>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-ink">访问 token</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="settings-action text-[11px]"
                        onClick={() => void (token ? copy(token, "token") : loadToken())}
                      >
                        {token ? (copied === "token" ? "已复制" : "复制") : "显示"}
                      </button>
                      <button
                        type="button"
                        className="settings-action inline-flex items-center gap-1 text-[11px]"
                        disabled={busy}
                        onClick={() => void regenerate()}
                      >
                        <RotateCcw className="h-3 w-3" />重置
                      </button>
                    </div>
                  </div>
                  <code className="block break-all rounded-md bg-slate-100 px-2.5 py-2 font-mono text-[11px] text-ink dark:bg-white/[0.06]">
                    {token ?? "••••••••••••••••••••••••••••••••••"}
                  </code>
                  <p className="mt-1.5 text-[11px] text-ink-muted">
                    客户端必须带 <code className="font-mono">Authorization: Bearer &lt;token&gt;</code>。重置后旧 token 立即失效。
                  </p>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-ink">客户端配置</span>
                    <button
                      type="button"
                      className="settings-action inline-flex items-center gap-1 text-[11px]"
                      onClick={() => void copy(clientConfig, "config")}
                    >
                      {copied === "config" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied === "config" ? "已复制" : "复制"}
                    </button>
                  </div>
                  <pre className="max-h-56 overflow-auto rounded-md bg-slate-100 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink dark:bg-white/[0.06]">
                    {clientConfig}
                  </pre>
                  <p className="mt-1.5 text-[11px] text-ink-muted">
                    贴进 Claude Code / Cursor / Cline 的 MCP 配置即可（streamable HTTP）。
                  </p>
                </div>
              </>
            )}

            <p className="text-[11px] text-ink-muted">
              可用工具清单与每次调用记录写在 AI 专用日志 <code className="font-mono">ai.log</code>
              （与主应用日志同目录），可在「设置 → 关于 → 日志目录」里打开查看。
            </p>
          </div>
        </Modal>
      )}

      {permissionDialogOpen && (
        <Modal title="权限模式" onClose={() => setPermissionDialogOpen(false)}>
          <p className="text-xs text-ink-muted">
            AI 通过 MCP 调用工具时遵守这里的规则。只读工具在任何模式下都直接放行。
          </p>
          <div className="mt-3 space-y-2">
            {MODES.map((item) => {
              const active = mode === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  disabled={busy}
                  onClick={() => void selectMode(item.value)}
                  className={
                    active
                      ? "flex w-full items-start gap-3 rounded-md border border-brand/30 bg-brand/10 px-3 py-2.5 text-left"
                      : "flex w-full items-start gap-3 rounded-md border border-subtle px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                  }
                >
                  <span
                    className={
                      active
                        ? "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-white"
                        : "mt-0.5 h-4 w-4 shrink-0 rounded-full border border-slate-300 dark:border-white/20"
                    }
                  >
                    {active && <Check className="h-2.5 w-2.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink">{item.label}</span>
                    <span className="mt-0.5 block text-[11px] text-ink-muted">{item.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {mode === "full" && (
            <p className="mt-3 flex items-start gap-1.5 rounded-md bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
              完全访问下送礼等真实扣费操作不会询问，请确认来源可信。
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
