import { useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { tauriCommands } from "@/lib/tauri";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import type { AiConfirmRequest } from "@/types/ai";

/**
 * AI 工具调用的确认弹窗。
 *
 * MCP 客户端发起需要确认的操作时，Rust 侧 emit `ai-confirm-request`，
 * 这里展示详情并把用户的决定回传。超时（55s）由 Rust 侧处理，前端不做倒计时，
 * 但会显示剩余时间提示，避免用户以为卡住了。
 */
export function ConfirmRequestDialog() {
  const [request, setRequest] = useState<AiConfirmRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useTauriEvent<AiConfirmRequest>("ai-confirm-request", (payload) => {
    setRequest(payload);
    setSubmitting(false);
  });

  const respond = async (approved: boolean) => {
    if (!request || submitting) return;
    setSubmitting(true);
    try {
      await tauriCommands.ai.confirmResponse(request.id, approved);
    } catch {
      // 超时后 id 已失效，静默关闭即可——调用方那边已经收到超时结果
    } finally {
      setRequest(null);
      setSubmitting(false);
    }
  };

  // Esc 等同拒绝：明确的操作比"点了外面"更安全
  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") void respond(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  if (!request) return null;

  const dangerous = request.risk === "costly" || request.risk === "destructive";
  const Icon = dangerous ? ShieldAlert : AlertTriangle;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="flex w-full max-w-md flex-col rounded-lg bg-app-surface p-6 shadow-xl dark:ring-1 dark:ring-white/[0.08]">
        <div className="flex items-start gap-3">
          <div
            className={
              dangerous
                ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
                : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
            }
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-medium text-ink">{request.title}</h3>
            <p className="mt-1 text-xs text-ink-muted">
              来自 AI 客户端 · 工具 {request.tool}
            </p>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-ink">
              {request.message}
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            className="settings-action"
            disabled={submitting}
            onClick={() => void respond(false)}
          >
            拒绝
          </button>
          <button
            type="button"
            className={
              dangerous
                ? "inline-flex items-center rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                : "inline-flex items-center rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-60"
            }
            disabled={submitting}
            onClick={() => void respond(true)}
          >
            {submitting ? "处理中…" : "允许"}
          </button>
        </div>
        <p className="mt-3 text-right text-[11px] text-ink-muted">
          超过 55 秒未响应将自动取消
        </p>
      </div>
    </div>
  );
}
