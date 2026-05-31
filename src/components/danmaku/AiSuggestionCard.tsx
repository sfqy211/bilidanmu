import { useCallback, useEffect, useState } from "react";
import { Bot, Loader2, Send, X } from "lucide-react";
import { tauriCommands } from "@/lib/tauri";
import type { AiSuggestion } from "@/types/bilibili";
import { useTauriEvent } from "@/hooks/useTauriEvent";

interface AiSuggestionCardProps {
  roomId: number;
  onSend: (message: string) => void;
}

export function AiSuggestionCard({ roomId, onSend }: AiSuggestionCardProps) {
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const MAX_SUGGESTIONS = 40;

  // 监听 AstrBot 回调事件
  useTauriEvent<AiSuggestion>("ai-suggestion", (payload) => {
    if (payload.roomId === roomId) {
      setSuggestions((prev) => {
        const next = [...prev, payload];
        return next.length > MAX_SUGGESTIONS ? next.slice(-MAX_SUGGESTIONS) : next;
      });
    }
  });

  // 清除已过期的建议（切房时）
  useEffect(() => {
    setSuggestions([]);
    setError(null);
  }, [roomId]);

  const handleTrigger = useCallback(
    async (action: "reply" | "summary") => {
      setTriggering(true);
      setError(null);
      try {
        const reply = await tauriCommands.ai.trigger(action, "");
        setSuggestions((prev) => [
          ...prev,
          {
            roomId,
            sender: "ai",
            senderName: "AI",
            message: reply,
          },
        ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "触发失败");
      } finally {
        setTriggering(false);
      }
    },
    [roomId]
  );

  const handleSend = useCallback(
    (message: string) => {
      onSend(message);
      setSuggestions((prev) => prev.filter((s) => s.message !== message));
    },
    [onSend]
  );

  const handleDismiss = useCallback((message: string) => {
    setSuggestions((prev) => prev.filter((s) => s.message !== message));
  }, []);

  return (
    <div className="space-y-2">
      {/* 触发按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => void handleTrigger("reply")}
          disabled={triggering}
          className="inline-flex items-center gap-1.5 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-violet-500/20 dark:text-violet-300 dark:hover:bg-violet-500/30"
        >
          {triggering ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Bot className="h-3 w-3" />
          )}
          AI 回复
        </button>
        <button
          onClick={() => void handleTrigger("summary")}
          disabled={triggering}
          className="inline-flex items-center gap-1.5 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-700 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-500/20 dark:text-cyan-300 dark:hover:bg-cyan-500/30"
        >
          {triggering ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Bot className="h-3 w-3" />
          )}
          AI 总结
        </button>
        {error && (
          <span className="text-xs text-rose-500 dark:text-rose-400">
            {error}
          </span>
        )}
      </div>

      {/* 建议列表 */}
      {suggestions.length > 0 && (
        <div className="max-h-32 space-y-1 overflow-y-auto">
          {suggestions.map((s, i) => (
            <div
              key={`${s.sender}-${i}`}
              className="flex items-center gap-2 bg-violet-50 px-3 py-1.5 dark:bg-violet-500/10"
            >
              <Bot className="h-3 w-3 shrink-0 text-violet-500 dark:text-violet-400" />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200">
                {s.message}
              </span>
              <button
                onClick={() => handleSend(s.message)}
                title="发送"
                className="shrink-0 p-1 text-violet-500 transition hover:bg-violet-100 dark:text-violet-400 dark:hover:bg-violet-500/20"
              >
                <Send className="h-3 w-3" />
              </button>
              <button
                onClick={() => handleDismiss(s.message)}
                title="忽略"
                className="shrink-0 p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/[0.04]"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
