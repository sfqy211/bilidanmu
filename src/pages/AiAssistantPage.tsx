import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Check, Loader2, Send, Trash2 } from "lucide-react";
import { SplitLayout } from "@/components/layout/SplitLayout";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { useWindowPersistence } from "@/hooks/useWindowPersistence";
import { useZoom } from "@/hooks/useZoom";
import { tauriCommands } from "@/lib/tauri";
import type { AiSuggestion } from "@/types/bilibili";
import { useAiStore } from "@/stores/ai-store";
import { useSettingsStore } from "@/stores/settings-store";

const MAX_REPLIES = 40;

export function AiAssistantPage() {
  useWindowPersistence("ai-window");
  useZoom();

  const summaries = useAiStore((s) => s.summaries);
  const addSummary = useAiStore((s) => s.addSummary);
  const fontSize = useSettingsStore((s) => s.settings.appearance.fontSize);

  const [replies, setReplies] = useState<AiSuggestion[]>([]);
  const [sentSet, setSentSet] = useState<Set<string>>(new Set());
  const [triggering, setTriggering] = useState<"reply" | "summary" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);
  const [customText, setCustomText] = useState("");

  const showError = (msg: string) => { setError(msg); setMsgKey((k) => k + 1); };
  const clearMessage = () => { setError(null); };

  const replyEndRef = useRef<HTMLDivElement>(null);
  const summaryEndRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  // 启动时拉取 + 每 10 秒轮询
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
    return () => {
      clearInterval(timer);
      lastCountRef.current = 0;
    };
  }, [addSummary]);

  const handleTrigger = useCallback(
    async (action: "reply" | "summary") => {
      setTriggering(action);
      clearMessage();
      try {
        const results = await tauriCommands.ai.trigger(action, "");
        const now = Math.floor(Date.now() / 1000);
        // 获取当前房间号
        let roomId = 0;
        try {
          const selections = await tauriCommands.selections.load(["currentRoomId"]);
          roomId = (selections.currentRoomId as number) ?? 0;
        } catch { /* ignore */ }
        const suggestions: AiSuggestion[] = results.map((text) => ({
          type: action,
          roomId,
          message: text,
          timestamp: now,
        }));
        if (action === "summary") {
          suggestions.forEach((s) => addSummary(s));
        } else {
          setReplies((prev) => [...prev, ...suggestions].slice(-MAX_REPLIES));
        }
      } catch (e) {
        showError(e instanceof Error ? e.message : "触发失败");
      } finally {
        setTriggering(null);
      }
    },
    [addSummary]
  );

  const handleSend = useCallback(async (message: string, allOptions?: string[]) => {
    const text = message.trim().slice(0, 40);
    if (!text) return;

    // 从 selections 获取当前房间号
    try {
      const selections = await tauriCommands.selections.load(["currentRoomId"]);
      const roomId = selections.currentRoomId as number | undefined;
      if (!roomId) return;
      await tauriCommands.danmaku.send(roomId, text);
    } catch { /* ignore */ }

    // 清空当前回复列表
    setReplies([]);
    setSentSet(new Set());

    // 后台学习用户偏好
    if (allOptions && allOptions.length > 1) {
      tauriCommands.ai.learn(text, allOptions).catch(() => {});
    }
  }, []);

  const handleDismiss = useCallback((message: string, type: "reply" | "summary") => {
    if (type === "reply") {
      setReplies((prev) => prev.filter((s) => s.message !== message));
    }
    // summary 由 store 管理，暂不支持单条删除
  }, []);

  const handleCustomSend = useCallback(async () => {
    const text = customText.trim().slice(0, 40);
    if (!text) return;
    try {
      const selections = await tauriCommands.selections.load(["currentRoomId"]);
      const roomId = selections.currentRoomId as number | undefined;
      if (!roomId) return;
      await tauriCommands.danmaku.send(roomId, text);
      setCustomText("");
      setReplies([]);
      setSentSet(new Set());
    } catch { /* ignore */ }
  }, [customText]);

  const allReplyOptions = replies.map((r) => r.message);

  return (
    <div className="flex h-full flex-col bg-[#f8f8f8] dark:bg-[#12141e]">
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
                      fontSize={fontSize}
                      allOptions={allReplyOptions}
                      onSend={(msg) => void handleSend(msg, allReplyOptions)}
                      onDismiss={() => handleDismiss(s.message, "reply")}
                    />
                  ))}
                  <div ref={replyEndRef} />
                </div>
              ) : (
                <EmptyState text="点击「获取回复」让 AI 根据弹幕生成回复" />
              )}

              {/* 自定义输入框 */}
              <div className="mt-3 flex gap-2">
                <input
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCustomSend();
                  }}
                  placeholder="输入自定义回复..."
                  className="flex-1 rounded border border-neutral-200 bg-[#f8f8f8] px-3 py-1.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-pink-500/30 dark:border-neutral-700 dark:bg-[#1a1c24] dark:text-white"
                />
                <button
                  onClick={() => void handleCustomSend()}
                  disabled={!customText.trim()}
                  className="inline-flex items-center gap-1 rounded bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-violet-500/20 dark:text-violet-300"
                >
                  <Send className="h-3 w-3" />
                  发送
                </button>
              </div>
            </div>
          </>
        }
        bottom={
          <>
            <PanelHeader title="AI 总结">
              <div className="flex items-center gap-2">
                {summaries.length > 0 && (
                  <button
                    onClick={() => {
                      tauriCommands.ai.clearSummaries().catch(() => {});
                      useAiStore.getState().clearSummaries();
                    }}
                    className="text-xs text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    清空
                  </button>
                )}
                <TriggerButton
                  action="summary"
                  triggering={triggering}
                  onClick={() => void handleTrigger("summary")}
                />
              </div>
            </PanelHeader>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {summaries.length > 0 ? (
                <div className="space-y-1.5">
                  {summaries.map((s, i) => (
                    <SummaryItem key={`summary-${i}`} suggestion={s} fontSize={fontSize} />
                  ))}
                  <div ref={summaryEndRef} />
                </div>
              ) : (
                <EmptyState text="点击「获取总结」或等待自动总结" />
              )}
            </div>
          </>
        }
      />

      {/* 错误提示 */}
      {error && (
        <InlineMessage key={msgKey} type="error" className="shrink-0">
          {error}
        </InlineMessage>
      )}
    </div>
  );
}

function PanelHeader({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between px-3 py-2">
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
  fontSize,
  allOptions,
  onSend,
  onDismiss,
}: {
  suggestion: AiSuggestion;
  isSent: boolean;
  type: "reply" | "summary";
  fontSize: number;
  allOptions?: string[];
  onSend: (message: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div className={`group flex items-start gap-2 px-2.5 py-2 ${
      isSent ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-[#f0f0f0] dark:bg-white/[0.03]"
    }`}>
      <Bot className="mt-0.5 h-3 w-3 shrink-0 text-violet-500 dark:text-violet-400" />
      <p className="min-w-0 flex-1 break-words whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-200"
        style={{ fontSize: `${fontSize}px` }}>
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
              onClick={() => onSend(suggestion.message)}
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
          className="p-1 text-slate-400 transition hover:bg-[#ebebeb] dark:hover:bg-white/[0.04]"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function SummaryItem({ suggestion, fontSize }: { suggestion: AiSuggestion; fontSize: number }) {
  const date = new Date(suggestion.timestamp * 1000);
  const timeStr = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex items-start gap-2 bg-[#f0f0f0] px-2.5 py-2 dark:bg-white/[0.03]">
      <Bot className="mt-0.5 h-3 w-3 shrink-0 text-cyan-500 dark:text-cyan-400" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
          {suggestion.roomId > 0 && <span>房间 {suggestion.roomId}</span>}
          <span>{timeStr}</span>
        </div>
        <p className="break-words whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-200"
          style={{ fontSize: `${fontSize}px` }}>
          {suggestion.message}
        </p>
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
