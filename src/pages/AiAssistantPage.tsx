import { useCallback, useRef, useState } from "react";
import { Bot, Check, Loader2, Send, Trash2 } from "lucide-react";
import { SplitLayout } from "@/components/layout/SplitLayout";
import { useWindowPersistence } from "@/hooks/useWindowPersistence";
import { tauriCommands } from "@/lib/tauri";
import type { AiSuggestion } from "@/types/bilibili";
import { useTauriEvent } from "@/hooks/useTauriEvent";

const MAX_SUGGESTIONS = 40;

export function AiAssistantPage() {
  useWindowPersistence("ai-window");

  const [replies, setReplies] = useState<AiSuggestion[]>([]);
  const [summaries, setSummaries] = useState<AiSuggestion[]>([]);
  const [sentSet, setSentSet] = useState<Set<string>>(new Set());
  const [triggering, setTriggering] = useState<"reply" | "summary" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const replyEndRef = useRef<HTMLDivElement>(null);
  const summaryEndRef = useRef<HTMLDivElement>(null);

  // 监听 AstrBot 回调事件（自动触发的回复）
  useTauriEvent<AiSuggestion>("ai-suggestion", (payload) => {
    setReplies((prev) => {
      const next = [...prev, payload];
      return next.length > MAX_SUGGESTIONS ? next.slice(-MAX_SUGGESTIONS) : next;
    });
  });

  const handleTrigger = useCallback(
    async (action: "reply" | "summary") => {
      setTriggering(action);
      setError(null);
      try {
        const result = await tauriCommands.ai.trigger(action, "");
        const suggestion: AiSuggestion = {
          roomId: 0,
          sender: "ai",
          senderName: action === "summary" ? "AI 总结" : "AI 回复",
          message: result,
        };
        if (action === "summary") {
          setSummaries((prev) => [...prev, suggestion].slice(-MAX_SUGGESTIONS));
        } else {
          setReplies((prev) => [...prev, suggestion].slice(-MAX_SUGGESTIONS));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "触发失败");
      } finally {
        setTriggering(null);
      }
    },
    []
  );

  const handleSend = useCallback(async (message: string) => {
    const text = message.trim().slice(0, 40);
    if (!text) return;
    // 发送到当前活跃的弹幕窗口（通过 AstrBot 转发）
    await tauriCommands.ai.trigger("send", text);
    setSentSet((prev) => new Set(prev).add(message));
  }, []);

  const handleDismiss = useCallback((message: string, type: "reply" | "summary") => {
    if (type === "reply") {
      setReplies((prev) => prev.filter((s) => s.message !== message));
    } else {
      setSummaries((prev) => prev.filter((s) => s.message !== message));
    }
    setSentSet((prev) => {
      const next = new Set(prev);
      next.delete(message);
      return next;
    });
  }, []);

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-[#12141e]">
      <SplitLayout
        storageKey="ai-divider-ratio"
        defaultRatio={0.5}
        className="flex min-h-0 flex-1 flex-col"
        top={
          <>
            <PanelHeader title="AI 回复">
              <TriggerButton
                action="reply"
                triggering={triggering}
                onClick={() => void handleTrigger("reply")}
              />
            </PanelHeader>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {replies.length > 0 ? (
                <div className="space-y-1.5">
                  {replies.map((s, i) => (
                    <SuggestionItem
                      key={`reply-${i}`}
                      suggestion={s}
                      isSent={sentSet.has(s.message)}
                      type="reply"
                      onSend={() => void handleSend(s.message)}
                      onDismiss={() => handleDismiss(s.message, "reply")}
                    />
                  ))}
                  <div ref={replyEndRef} />
                </div>
              ) : (
                <EmptyState text="点击「获取回复」让 AI 根据弹幕生成回复" />
              )}
            </div>
          </>
        }
        bottom={
          <>
            <PanelHeader title="AI 总结">
              <TriggerButton
                action="summary"
                triggering={triggering}
                onClick={() => void handleTrigger("summary")}
              />
            </PanelHeader>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {summaries.length > 0 ? (
                <div className="space-y-1.5">
                  {summaries.map((s, i) => (
                    <SuggestionItem
                      key={`summary-${i}`}
                      suggestion={s}
                      isSent={false}
                      type="summary"
                      onSend={() => void handleSend(s.message)}
                      onDismiss={() => handleDismiss(s.message, "summary")}
                    />
                  ))}
                  <div ref={summaryEndRef} />
                </div>
              ) : (
                <EmptyState text="点击「获取总结」让 AI 总结当前弹幕内容" />
              )}
            </div>
          </>
        }
      />

      {/* 错误提示 */}
      {error && (
        <div className="shrink-0 border-t border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">
          {error}
        </div>
      )}
    </div>
  );
}

function PanelHeader({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-white/[0.04]">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{title}</span>
      {children}
    </div>
  );
}

function TriggerButton({
  action,
  triggering,
  onClick,
}: {
  action: "reply" | "summary";
  triggering: "reply" | "summary" | null;
  onClick: () => void;
}) {
  const isReply = action === "reply";
  return (
    <button
      onClick={onClick}
      disabled={triggering !== null}
      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
        isReply
          ? "bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-500/20 dark:text-violet-300 dark:hover:bg-violet-500/30"
          : "bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-500/20 dark:text-cyan-300 dark:hover:bg-cyan-500/30"
      }`}
    >
      {triggering === action ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Bot className="h-3 w-3" />
      )}
      {isReply ? "获取回复" : "获取总结"}
    </button>
  );
}

function SuggestionItem({
  suggestion,
  isSent,
  type,
  onSend,
  onDismiss,
}: {
  suggestion: AiSuggestion;
  isSent: boolean;
  type: "reply" | "summary";
  onSend: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className={`group flex items-start gap-2 px-2.5 py-2 ${
      isSent ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-slate-50 dark:bg-white/[0.03]"
    }`}>
      <Bot className="mt-0.5 h-3 w-3 shrink-0 text-violet-500 dark:text-violet-400" />
      <p className="min-w-0 flex-1 break-words whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-200">
        {suggestion.message}
      </p>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
        {type === "reply" && (
          isSent ? (
            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" />
              已发送
            </span>
          ) : (
            <button
              onClick={onSend}
              title="发送到弹幕"
              className="p-1 text-violet-500 transition hover:bg-violet-100 dark:text-violet-400 dark:hover:bg-violet-500/20"
            >
              <Send className="h-3 w-3" />
            </button>
          )
        )}
        <button
          onClick={onDismiss}
          title="删除"
          className="p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/[0.04]"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 text-slate-300 dark:text-slate-600">
      <Bot className="h-6 w-6" />
      <p className="text-xs">{text}</p>
    </div>
  );
}
