import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { tauriCommands } from "@/lib/tauri";
import type { AiPermissionMode, McpStatus } from "@/types/ai";

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

export function AIPage() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [mode, setMode] = useState<AiPermissionMode>("autonomous");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [mcpStatus, permissionMode] = await Promise.all([
        tauriCommands.ai.mcpStatus(),
        tauriCommands.ai.getPermissionMode(),
      ]);
      setStatus(mcpStatus);
      setMode(permissionMode);
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
                <pre className="max-h-40 overflow-auto rounded-md bg-slate-100 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink dark:bg-white/[0.06]">
                  {clientConfig}
                </pre>
                <p className="mt-1.5 text-[11px] text-ink-muted">
                  贴进 Claude Code / Cursor / Cline 的 MCP 配置即可（streamable HTTP）。
                </p>
              </div>
            </div>
          )}

          <p className="mt-4 text-[11px] text-ink-muted">
            可用工具清单与每次调用记录写在 AI 专用日志 <code className="font-mono">ai.log</code>
            （与主应用日志同目录），可在「设置 → 关于 → 日志目录」里打开查看。
          </p>
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
      </div>
    </section>
  );
}
