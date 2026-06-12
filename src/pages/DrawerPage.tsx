import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Bot, Loader2, Send, Trash2, X } from "lucide-react";
import { tauriCommands } from "@/lib/tauri";
import { useZoom } from "@/hooks/useZoom";
import { useAiStore } from "@/stores/ai-store";
import { useSettingsStore } from "@/stores/settings-store";
import { InlineMessage } from "@/components/ui/InlineMessage";
import type { AiSuggestion } from "@/types/bilibili";

const appWindow = getCurrentWindow();

const MAX_REPLIES = 40;

export function DrawerPage() {
  useZoom();

  const { roomId: roomIdParam } = useParams();
  const roomId = Number(roomIdParam ?? 0) || null;

  const summaries = useAiStore((s) => s.summaries);
  const addSummary = useAiStore((s) => s.addSummary);
  const fontSize = useSettingsStore((s) => s.settings.appearance.fontSize);

  const [replies, setReplies] = useState<AiSuggestion[]>([]);
  const [triggering, setTriggering] = useState<"reply" | "summary" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);
  const [customText, setCustomText] = useState("");

  const replyEndRef = useRef<HTMLDivElement>(null);
  const summaryEndRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  // AI 总结轮询
  useEffect(() => {
    lastCountRef.current = 0;
    const fetchSummaries = async () => {
      try {
        const data = await tauriCommands.ai.getSummaries();
        if (data.length > lastCountRef.current) {
          data.slice(lastCountRef.current).forEach((s) => addSummary(s));
          lastCountRef.current = data.length;
        }
      } catch { /* ignore */ }
    };
    void fetchSummaries();
    const timer = setInterval(() => void fetchSummaries(), 10_000);
    return () => { clearInterval(timer); lastCountRef.current = 0; };
  }, [addSummary]);

  const handleTrigger = useCallback(async (action: "reply" | "summary") => {
    setTriggering(action);
    setError(null);
    try {
      const results = await tauriCommands.ai.trigger(action, "");
      const now = Math.floor(Date.now() / 1000);
      const suggestions: AiSuggestion[] = results.map((text) => ({
        id: crypto.randomUUID(),
        type: action,
        roomId: roomId ?? 0,
        message: text,
        timestamp: now,
      }));
      if (action === "summary") {
        suggestions.forEach((s) => addSummary(s));
        setTimeout(() => summaryEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      } else {
        setReplies((prev) => [...prev, ...suggestions].slice(-MAX_REPLIES));
        setTimeout(() => replyEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "触发失败");
    } finally {
      setTriggering(null);
    }
  }, [roomId, addSummary]);

  const handleSendReply = useCallback(async (message: string, allOptions?: string[]) => {
    const text = message.trim().slice(0, 40);
    if (!text || !roomId) return;
    await tauriCommands.danmaku.send(roomId, text);
    setReplies([]);
    if (allOptions && allOptions.length > 1) {
      tauriCommands.ai.learn(text, allOptions).catch(() => {});
    }
  }, [roomId]);

  const handleCustomSend = useCallback(async () => {
    const text = customText.trim().slice(0, 40);
    if (!text || !roomId) return;
    await tauriCommands.danmaku.send(roomId, text);
    setCustomText("");
    setReplies([]);
  }, [roomId, customText]);

  return (
    <main className="window-rounded flex h-full flex-col overflow-hidden select-none bg-[#f8f8f8] text-slate-900 dark:bg-[#12141e] dark:text-slate-100">
      {/* 标题栏 */}
      <div className="flex select-none items-center justify-between bg-[#f0f0f0] px-3 py-1.5 dark:bg-[#0e1018]">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">AI 助手</span>
        <button
          type="button"
          onClick={() => void appWindow.close()}
          className="flex h-5 w-5 items-center justify-center rounded text-slate-400 transition hover:bg-rose-500 hover:text-white dark:text-slate-500 dark:hover:bg-rose-500"
          title="关闭"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* 内容 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {/* AI 回复 */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">AI 回复</span>
          <button
            onClick={() => void handleTrigger("reply")}
            disabled={triggering !== null}
            className="inline-flex items-center gap-1 rounded bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-violet-500/20 dark:text-violet-300"
          >
            {triggering === "reply" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />}
            获取回复
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {replies.length > 0 ? (
            <div className="space-y-1">
              {replies.map((s, i) => (
                <div key={s.id ?? `reply-${i}`} className="group flex items-start gap-1.5 rounded bg-[#f0f0f0] px-2 py-1.5 dark:bg-white/[0.03]">
                  <Bot className="mt-0.5 h-3 w-3 shrink-0 text-violet-500 dark:text-violet-400" />
                  <p className="min-w-0 flex-1 break-words whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-200" style={{ fontSize: `${fontSize}px` }}>
                    {s.message}
                  </p>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <button onClick={() => void handleSendReply(s.message, replies.map((r) => r.message))} title="发送" className="p-0.5 text-violet-500 transition hover:bg-violet-100 dark:text-violet-400 dark:hover:bg-violet-500/20">
                      <Send className="h-3 w-3" />
                    </button>
                    <button onClick={() => setReplies((prev) => prev.filter((r) => r.id !== s.id))} title="删除" className="p-0.5 text-slate-400 transition hover:bg-[#ebebeb] dark:hover:bg-white/[0.04]">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
              <div ref={replyEndRef} />
            </div>
          ) : (
            <div className="flex h-20 flex-col items-center justify-center gap-1 text-slate-300 dark:text-slate-600">
              <Bot className="h-5 w-5" />
              <p className="text-xs">点击「获取回复」</p>
            </div>
          )}
        </div>

        {/* 自定义输入 */}
        <div className="flex gap-1.5">
          <input
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleCustomSend(); }}
            placeholder="自定义回复..."
            className="flex-1 rounded border border-neutral-200 bg-[#f8f8f8] px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-pink-500/30 dark:border-neutral-700 dark:bg-[#1a1c24] dark:text-white"
          />
          <button
            onClick={() => void handleCustomSend()}
            disabled={!customText.trim()}
            className="inline-flex items-center gap-1 rounded bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-violet-500/20 dark:text-violet-300"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>

        {/* 分隔线 */}
        <div className="h-px bg-neutral-200/50 dark:bg-white/[0.06]" />

        {/* AI 总结 */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">AI 总结</span>
          <div className="flex items-center gap-2">
            {summaries.length > 0 && (
              <button
                onClick={() => { tauriCommands.ai.clearSummaries().catch(() => {}); useAiStore.getState().clearSummaries(); }}
                className="text-xs text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
              >
                清空
              </button>
            )}
            <button
              onClick={() => void handleTrigger("summary")}
              disabled={triggering !== null}
              className="inline-flex items-center gap-1 rounded bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-700 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-500/20 dark:text-cyan-300"
            >
              {triggering === "summary" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />}
              获取总结
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {summaries.length > 0 ? (
            <div className="space-y-1">
              {summaries.map((s, i) => (
                <div key={`summary-${i}`} className="flex items-start gap-1.5 rounded bg-[#f0f0f0] px-2 py-1.5 dark:bg-white/[0.03]">
                  <Bot className="mt-0.5 h-3 w-3 shrink-0 text-cyan-500 dark:text-cyan-400" />
                  <p className="min-w-0 flex-1 break-words whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-200" style={{ fontSize: `${fontSize}px` }}>
                    {s.message}
                  </p>
                </div>
              ))}
              <div ref={summaryEndRef} />
            </div>
          ) : (
            <div className="flex h-20 flex-col items-center justify-center gap-1 text-slate-300 dark:text-slate-600">
              <Bot className="h-5 w-5" />
              <p className="text-xs">点击「获取总结」</p>
            </div>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <InlineMessage key={msgKey} type="error" className="shrink-0">{error}</InlineMessage>
        )}
      </div>
    </main>
  );
}
