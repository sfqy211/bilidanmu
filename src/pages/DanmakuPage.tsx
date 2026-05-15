import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowDown, Flame, Send, Smile, Wifi, WifiOff } from "lucide-react";
import { DanmakuMessageItem } from "@/components/danmaku/DanmakuMessageItem";
import { EmoticonPickerPanel } from "@/components/danmaku/EmoticonPickerPanel";
import { SuperChatCard } from "@/components/danmaku/SuperChatCard";
import { useDanmaku } from "@/hooks/useDanmaku";
import { useScheduler } from "@/hooks/useScheduler";
import { useDanmakuStream } from "@/hooks/useDanmakuStream";
import { tauriCommands } from "@/lib/tauri";
import { useDanmakuStore } from "@/stores/danmaku-store";
import type { Emoticon, EmoticonPackage } from "@/types/bilibili";

const statusTextMap = {
  idle: "未连接",
  connecting: "连接中",
  connected: "已连接",
  reconnecting: "重连中",
  disconnected: "已断开",
  error: "连接异常"
} as const;

function formatPopularity(n: number): string {
  if (n >= 10_000) {
    return `${(n / 10_000).toFixed(1)}万`;
  }

  return String(n);
}

function serializeEmoticonOptions(emoticon: Emoticon): string | undefined {
  if (emoticon.emoticonOptions) {
    return JSON.stringify(emoticon.emoticonOptions);
  }

  if (!emoticon.emoticonUnique) {
    return undefined;
  }

  return JSON.stringify({ emoticon_unique: emoticon.emoticonUnique });
}

function formatStopReason(reason: string): string {
  if (reason === "manual") {
    return "手动停止";
  }

  if (reason === "error") {
    return "发生错误";
  }

  return reason;
}

export function DanmakuPage() {
  const { roomId: roomIdParam } = useParams();
  const roomId = useMemo(() => Number(roomIdParam ?? 0) || null, [roomIdParam]);
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [emoticonPickerOpen, setEmoticonPickerOpen] = useState(false);
  const [emoticonPackages, setEmoticonPackages] = useState<EmoticonPackage[]>([]);
  const [loadingEmoticons, setLoadingEmoticons] = useState(false);
  const [emoticonError, setEmoticonError] = useState<string | null>(null);
  const [activePkgId, setActivePkgId] = useState<number | null>(null);
  const [loopMessagesInput, setLoopMessagesInput] = useState("");
  const [loopIntervalSec, setLoopIntervalSec] = useState("2");

  useDanmakuStream(roomId);

  const messages = useDanmakuStore((state) => state.messages);
  const wsConnected = useDanmakuStore((state) => state.wsConnected);
  const wsStatus = useDanmakuStore((state) => state.wsStatus);
  const lastError = useDanmakuStore((state) => state.lastError);
  const sentCount = useDanmakuStore((state) => state.sentCount);
  const popularity = useDanmakuStore((state) => state.popularity);
  const { send, sendEmoticon, sending } = useDanmaku();
  const {
    isRunning: loopRunning,
    lastSentMessage: lastLoopMessage,
    lastError: loopError,
    lastIndex: lastLoopIndex,
    loopSentCount,
    stopReason,
    start: startLoop,
    stop: stopLoop
  } = useScheduler(roomId);

  const checkAtBottom = useCallback(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const threshold = 80;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    setIsAtBottom(distanceFromBottom <= threshold);
  }, []);

  useEffect(() => {
    if (!isAtBottom) {
      return;
    }

    const container = scrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, isAtBottom]);

  const loadEmoticons = useCallback(async () => {
    if (!roomId) {
      return;
    }

    setLoadingEmoticons(true);
    setEmoticonError(null);

    try {
      const packages = await tauriCommands.room.getEmoticons(roomId);
      setEmoticonPackages(packages);
      setActivePkgId((current) => {
        if (current && packages.some((pkg) => pkg.pkgId === current)) {
          return current;
        }
        return packages[0]?.pkgId ?? null;
      });
    } catch (error) {
      setEmoticonError(error instanceof Error ? error.message : "加载表情失败");
    } finally {
      setLoadingEmoticons(false);
    }
  }, [roomId]);

  const handleToggleEmoticonPicker = useCallback(async () => {
    const nextOpen = !emoticonPickerOpen;
    setEmoticonPickerOpen(nextOpen);

    if (nextOpen && emoticonPackages.length === 0 && !loadingEmoticons) {
      await loadEmoticons();
    }
  }, [emoticonPackages.length, emoticonPickerOpen, loadEmoticons, loadingEmoticons]);

  const handleSend = async () => {
    if (!roomId || !message.trim()) {
      return;
    }

    await send(roomId, message.trim());
    setMessage("");
  };

  const handleSendEmoticon = useCallback(
    async (emoticon: Emoticon) => {
      if (!roomId || !emoticon.emoticonUnique || (emoticon.perm ?? 1) === 0) {
        return;
      }

      await sendEmoticon(roomId, emoticon.emoticonUnique, serializeEmoticonOptions(emoticon));
      setEmoticonPickerOpen(false);
    },
    [roomId, sendEmoticon]
  );

  const scrollToBottom = () => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    setIsAtBottom(true);
  };

  const loopMessages = useMemo(
    () => loopMessagesInput.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    [loopMessagesInput]
  );

  const handleStartLoop = async () => {
    const intervalSec = Number(loopIntervalSec);
    if (!Number.isFinite(intervalSec) || intervalSec < 0.3) {
      return;
    }

    try {
      await startLoop(loopMessages, Math.round(intervalSec * 1000));
    } catch {
      // 错误已由 useScheduler 记录并展示，这里只避免未处理的 Promise rejection
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 bg-slate-950 text-slate-100 lg:grid-cols-[320px_1fr]">
      <aside className="border-b border-white/10 p-6 lg:border-b-0 lg:border-r">
        <Link to="/rooms" className="text-sm text-pink-400 hover:text-pink-300">
          ← 返回直播间
        </Link>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h1 className="text-xl font-semibold">房间 {roomIdParam}</h1>
          <div className="mt-4 flex items-center gap-2 text-sm">
            {wsConnected ? (
              <Wifi className="h-4 w-4 text-emerald-400" />
            ) : (
              <WifiOff className="h-4 w-4 text-amber-400" />
            )}
            <span className="text-slate-200">{statusTextMap[wsStatus]}</span>
          </div>

          {wsConnected && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Flame className="h-4 w-4 text-orange-400" />
              <span className="text-orange-300">人气 {formatPopularity(popularity)}</span>
            </div>
          )}

          <p className="mt-3 text-sm text-slate-400">已发送 {sentCount} 条弹幕</p>
          {lastError ? <p className="mt-3 text-sm text-rose-400">{lastError}</p> : null}
        </div>
      </aside>

      <main className="flex min-h-0 flex-col p-6">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 text-sm text-slate-400">
            <span>实时弹幕流</span>
            {popularity > 0 && (
              <span className="flex items-center gap-1.5 text-orange-300">
                <Flame className="h-3.5 w-3.5" />
                {formatPopularity(popularity)}
              </span>
            )}
          </div>

          <div
            ref={scrollRef}
            onScroll={checkAtBottom}
            className="flex flex-1 flex-col gap-2 overflow-y-auto p-5"
          >
            {messages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/30 p-6 text-sm text-slate-500">
                暂无弹幕，连接成功后会在这里实时显示。
              </div>
            ) : (
              messages.map((item) =>
                item.type === "superChat" ? (
                  <SuperChatCard key={`${item.roomId}-${item.id}-${item.timestamp}`} item={item} />
                ) : (
                  <DanmakuMessageItem key={`${item.roomId}-${item.id}-${item.timestamp}`} item={item} />
                )
              )
            )}
          </div>

          {!isAtBottom && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-pink-500/90 px-4 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur transition hover:bg-pink-400"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              回到底部
            </button>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/90 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm text-slate-400">发送弹幕</label>
                <button
                  type="button"
                  onClick={() => void handleToggleEmoticonPicker()}
                  disabled={!roomId || sending}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Smile className="h-3.5 w-3.5" />
                  表情
                </button>
              </div>

              {emoticonPickerOpen ? (
                <EmoticonPickerPanel
                  loading={loadingEmoticons}
                  error={emoticonError}
                  packages={emoticonPackages}
                  activePkgId={activePkgId}
                  sending={sending}
                  onClose={() => setEmoticonPickerOpen(false)}
                  onReload={() => void loadEmoticons()}
                  onSelectPackage={setActivePkgId}
                  onSelectEmoticon={(emoticon) => void handleSendEmoticon(emoticon)}
                />
              ) : null}

              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value.slice(0, 20))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="输入要发送的弹幕内容，最多 20 字"
                className="min-h-24 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
              />
              <p className="mt-2 text-right text-xs text-slate-500">{message.length}/20</p>
            </div>
            <button
              onClick={() => void handleSend()}
              disabled={!roomId || !message.trim() || sending}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-pink-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {sending ? "发送中..." : "发送"}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-medium text-white">独轮车（最小版）</h3>
              <p className="mt-1 text-xs text-slate-400">每行一条弹幕，按固定间隔循环发送。</p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs ${
                loopRunning
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {loopRunning ? "运行中" : "未运行"}
            </span>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_160px_auto]">
            <textarea
              value={loopMessagesInput}
              onChange={(event) => setLoopMessagesInput(event.target.value)}
              placeholder={"每行一条循环弹幕\n第一条\n第二条\n第三条"}
              className="min-h-28 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
            />
            <div>
              <label className="mb-2 block text-sm text-slate-400">发送间隔（秒）</label>
              <input
                value={loopIntervalSec}
                onChange={(event) => setLoopIntervalSec(event.target.value)}
                inputMode="decimal"
                className="h-12 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none"
              />
              <p className="mt-2 text-xs text-slate-500">最小 0.3 秒，当前共 {loopMessages.length} 条</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => void handleStartLoop()}
                disabled={!roomId || loopRunning || loopMessages.length === 0 || Number(loopIntervalSec) < 0.3}
                className="rounded-xl bg-pink-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                开始循环
              </button>
              <button
                onClick={() => void stopLoop()}
                disabled={!loopRunning}
                className="rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                停止循环
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-1 text-xs">
            {lastLoopMessage ? <p className="text-slate-400">最近发送：{lastLoopMessage}</p> : null}
            {lastLoopIndex !== null ? (
              <p className="text-slate-500">当前条目索引：#{lastLoopIndex + 1}</p>
            ) : null}
            <p className="text-slate-500">累计循环发送：{loopSentCount} 条</p>
            {stopReason ? <p className="text-slate-500">停止原因：{formatStopReason(stopReason)}</p> : null}
            {loopError ? <p className="text-rose-400">循环发送错误：{loopError}</p> : null}
          </div>
        </div>
      </main>
    </div>
  );
}
