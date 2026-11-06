import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { tauriCommands } from "@/lib/tauri";
import type {
  AiAuditEntry,
  AiPermissionMode,
  AiRisk,
  AiToolActivity,
  AiToolResult,
  AiToolSpec,
  McpStatus,
} from "@/types/ai";

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

const RISK_LABEL: Record<AiRisk, string> = {
  read: "只读",
  write: "写",
  costly: "有风险",
  destructive: "不可逆",
};

const RISK_CLASS: Record<AiRisk, string> = {
  read: "bg-slate-100 text-slate-600 dark:bg-white/[0.08] dark:text-slate-300",
  write: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  costly: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  destructive: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

export function AIPage() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [mode, setMode] = useState<AiPermissionMode>("autonomous");
  const [tools, setTools] = useState<AiToolSpec[]>([]);
  const [audit, setAudit] = useState<AiAuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [mcpStatus, permissionMode, toolSpecs, auditEntries] = await Promise.all([
        tauriCommands.ai.mcpStatus(),
        tauriCommands.ai.getPermissionMode(),
        tauriCommands.ai.listTools(),
        tauriCommands.ai.auditList(30),
      ]);
      setStatus(mcpStatus);
      setMode(permissionMode);
      setTools(toolSpecs);
      setAudit(auditEntries);
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // MCP 侧的调用会广播活动事件：刷新审计让界面跟上真实发生的事
  useTauriEvent<AiToolActivity>("ai-tool-activity", () => {
    void tauriCommands.ai.auditList(30).then(setAudit).catch(() => {});
  });
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

  const clearAudit = async () => {
    try {
      await tauriCommands.ai.auditClear();
      setAudit([]);
    } catch (reason) {
      setError(String(reason));
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

        {/* ── MCP 服务 ─────────────────────────────────────── */}
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
            <div className="mt-4 space-y-3">
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
                  {token ?? "••••••••••••••••••••••••••••••••"}
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
                <pre className="max-h-40 overflow-auto rounded-md bg-slate-100 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink dark:bg-white/[0.06]">
                  {clientConfig}
                </pre>
                <p className="mt-1.5 text-[11px] text-ink-muted">
                  贴进 Claude Code / Cursor / Cline 的 MCP 配置即可（streamable HTTP）。
                </p>
              </div>
            </div>
          )}
        </section>

        {/* ── 权限模式 ─────────────────────────────────────── */}
        <section className="border-t border-subtle py-5">
          <h3 className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <ShieldCheck className="h-4 w-4" />权限模式
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
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
                      ? "flex w-full items-start gap-3 rounded-md border border-brand/50 bg-brand/[0.06] px-3 py-2.5 text-left"
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
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
              完全访问下送礼等真实扣费操作不会询问，请确认来源可信。
            </p>
          )}
        </section>

        {/* ── 工具清单 ─────────────────────────────────────── */}
        <section className="border-t border-subtle py-5">
          <h3 className="text-[13px] font-medium text-ink">
            可用工具 <span className="text-ink-muted">（{tools.length}）</span>
          </h3>
          <div className="mt-3 space-y-1.5">
            {tools.map((tool) => (
              <ToolRow key={tool.name} tool={tool} />
            ))}
            {tools.length === 0 && (
              <p className="text-xs text-ink-muted">正在加载工具清单…</p>
            )}
          </div>
        </section>

        {/* ── 调用记录 ─────────────────────────────────────── */}
        <section className="border-t border-subtle py-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-medium text-ink">
              最近调用 <span className="text-ink-muted">（{audit.length}）</span>
            </h3>
            {audit.length > 0 && (
              <button type="button" className="settings-action text-[11px]" onClick={() => void clearAudit()}>
                清空
              </button>
            )}
          </div>
          <div className="mt-3 space-y-1">
            {audit.map((entry, index) => (
              <div
                key={`${entry.createdAt}-${index}`}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-[11px] hover:bg-slate-50 dark:hover:bg-white/[0.03]"
              >
                <span
                  className={
                    entry.ok
                      ? "h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                      : "h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500"
                  }
                />
                <code className="shrink-0 font-mono text-ink">{entry.tool}</code>
                <span className="shrink-0 text-ink-muted">{entry.origin === "mcp" ? "外部" : "调试"}</span>
                <span className="min-w-0 flex-1 truncate text-ink-muted">{entry.summary}</span>
                <span className="shrink-0 tabular-nums text-ink-muted">{entry.durationMs}ms</span>
              </div>
            ))}
            {audit.length === 0 && (
              <p className="text-xs text-ink-muted">还没有调用记录。外部客户端连上来后，这里会实时出现。</p>
            )}
          </div>
        </section>

        {/* ── 调试面板 ─────────────────────────────────────── */}
        <ToolDebugPanel tools={tools} />
      </div>
    </section>
  );
}

function ToolRow({ tool }: { tool: AiToolSpec }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-subtle">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown
          className={
            open
              ? "h-3 w-3 shrink-0 rotate-180 text-ink-muted transition-transform"
              : "h-3 w-3 shrink-0 text-ink-muted transition-transform"
          }
        />
        <code className="shrink-0 font-mono text-[11px] text-ink">{tool.name}</code>
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-muted">{tool.title}</span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${RISK_CLASS[tool.risk]}`}>
          {RISK_LABEL[tool.risk]}
        </span>
      </button>
      {open && (
        <div className="border-t border-subtle px-2.5 py-2">
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-ink-muted">{tool.description}</p>
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-100 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-ink dark:bg-white/[0.06]">
            {JSON.stringify(tool.inputSchema, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/** 调试面板：不接模型也能验证整条工具链路 */
function ToolDebugPanel({ tools }: { tools: AiToolSpec[] }) {
  const [toolName, setToolName] = useState("");
  const [argsText, setArgsText] = useState("{}");
  const [result, setResult] = useState<AiToolResult | null>(null);
  const [running, setRunning] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (!toolName && tools.length > 0) setToolName(tools[0].name);
  }, [tools, toolName]);

  const run = async () => {
    setParseError(null);
    let args: Record<string, unknown>;
    try {
      const parsed = JSON.parse(argsText || "{}");
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("参数必须是 JSON 对象");
      }
      args = parsed as Record<string, unknown>;
    } catch (reason) {
      setParseError(`参数解析失败：${String(reason)}`);
      return;
    }

    setRunning(true);
    try {
      setResult(await tauriCommands.ai.callTool(toolName, args));
    } catch (reason) {
      setResult({
        ok: false,
        error: { code: "INVOKE_FAILED", message: String(reason), retryable: false },
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="border-t border-subtle py-5">
      <h3 className="text-[13px] font-medium text-ink">调试面板</h3>
      <p className="mt-1 text-xs text-ink-muted">
        直接调用一个工具验证返回结构。同样受权限模式约束，调用会记入上面的调用记录。
      </p>

      <div className="mt-3 space-y-2">
        <select
          className="settings-select w-full"
          value={toolName}
          onChange={(event) => {
            setToolName(event.target.value);
            setResult(null);
          }}
        >
          {tools.map((tool) => (
            <option key={tool.name} value={tool.name}>
              {tool.name} — {tool.title}
            </option>
          ))}
        </select>

        <textarea
          className="settings-select h-28 w-full resize-y font-mono text-[11px]"
          value={argsText}
          spellCheck={false}
          onChange={(event) => setArgsText(event.target.value)}
        />

        {parseError && (
          <p className="text-[11px] text-rose-600 dark:text-rose-300" role="alert">{parseError}</p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="settings-action inline-flex items-center gap-1.5"
            disabled={running || !toolName}
            onClick={() => void run()}
          >
            <Play className="h-3.5 w-3.5" />{running ? "执行中…" : "执行"}
          </button>
          <button
            type="button"
            className="settings-action text-[11px]"
            onClick={() => setArgsText(JSON.stringify(exampleArgs(toolName), null, 2))}
          >
            填入示例
          </button>
        </div>

        {result && (
          <pre
            className={
              result.ok
                ? "max-h-72 overflow-auto rounded-md bg-slate-100 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink dark:bg-white/[0.06]"
                : "max-h-72 overflow-auto rounded-md bg-rose-50 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
            }
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </section>
  );
}

/** 几个常用工具的最小可运行参数，省得手敲 */
function exampleArgs(toolName: string): Record<string, unknown> {
  switch (toolName) {
    case "live_get_context":
      return { danmakuLimit: 20, includeActivity: true };
    case "live_query_danmaku":
      return { limit: 20 };
    case "room_search":
      return { keyword: "原神", mode: "name" };
    case "room_get":
      return { roomId: 1 };
    case "danmaku_send":
      return { message: "测试弹幕" };
    case "video_search":
      return { keyword: "编程" };
    case "settings_get":
      return { keys: ["sendInterval", "rateLimit"] };
    default:
      return {};
  }
}
