import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowDown, Flame, Send, Smile, Wifi, WifiOff, X } from "lucide-react";
import { useDanmaku } from "@/hooks/useDanmaku";
import { useScheduler } from "@/hooks/useScheduler";
import { useDanmakuStream } from "@/hooks/useDanmakuStream";
import { tauriCommands } from "@/lib/tauri";
import { useDanmakuStore } from "@/stores/danmaku-store";
import type { Emoticon, EmoticonPackage } from "@/types/bilibili";
import type { BigEmoticonOptions, InlineEmoticon } from "@/types/danmaku";

const statusTextMap = {
  idle: "未连接",
  connecting: "连接中",
  connected: "已连接",
  reconnecting: "重连中",
  disconnected: "已断开",
  error: "连接异常"
} as const;

function formatTime(ts: number): string {
  if (!ts) {
    return "";
  }

  const date = new Date(ts * 1000);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatPopularity(n: number): string {
  if (n >= 10_000) {
    return `${(n / 10_000).toFixed(1)}万`;
  }

  return String(n);
}

function colorToHex(color?: number): string | undefined {
  if (color == null || color === 16_777_215) {
    return undefined;
  }

  return `#${color.toString(16).padStart(6, "0")}`;
}

function normalizeHexColor(color?: string, fallback?: string): string | undefined {
  if (!color) {
    return fallback;
  }

  if (color.startsWith("#")) {
    return color;
  }

  return `#${color}`;
}

function getPackageLabel(pkg: EmoticonPackage): string {
  return pkg.pkgName || `表情包 ${pkg.pkgId}`;
}

function isEmoticonAvailable(emoticon: Emoticon): boolean {
  return (emoticon.perm ?? 1) !== 0 && Boolean(emoticon.emoticonUnique);
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

function getMessageCardClass(type: string): string {
  if (type === "gift") {
    return "rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2";
  }

  if (type === "entry") {
    return "rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2";
  }

  return "rounded-lg bg-slate-950/50 px-3 py-2";
}

function getMessageTextClass(type: string): string {
  if (type === "gift") {
    return "mt-1 break-words text-sm text-amber-100";
  }

  if (type === "entry") {
    return "mt-1 break-words text-sm text-slate-300";
  }

  return "mt-1 break-words text-sm";
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderInlineEmots(content: string, emots?: Record<string, InlineEmoticon>) {
  if (!emots || Object.keys(emots).length === 0) {
    return content;
  }

  const keys = Object.keys(emots);
  if (keys.length === 0) {
    return content;
  }

  const pattern = new RegExp(
    [...keys].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|"),
    "g"
  );
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(content.slice(lastIndex, index));
    }

    const token = match[0];
    const emot = emots[token];
    if (emot?.url) {
      parts.push(
        <img
          key={`${token}-${index}`}
          src={emot.url}
          alt={emot.emoji ?? token}
          title={emot.descript ?? token}
          className="mx-0.5 inline-block align-middle"
          style={{
            width: emot.width ?? 20,
            height: emot.height ?? 20
          }}
        />
      );
    } else {
      parts.push(token);
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts;
}

function getBigEmoticonSize(emoticon?: BigEmoticonOptions) {
  if (!emoticon) {
    return { width: 162, height: 162 };
  }

  if (emoticon.emoticonUnique?.startsWith("official_")) {
    return {
      width: emoticon.width ?? 183,
      height: emoticon.height ?? 60
    };
  }

  return { width: 162, height: 162 };
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
      if (!roomId || !emoticon.emoticonUnique || !isEmoticonAvailable(emoticon)) {
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

  const activePackage = useMemo(
    () => emoticonPackages.find((pkg) => pkg.pkgId === activePkgId) ?? emoticonPackages[0],
    [activePkgId, emoticonPackages]
  );

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
              messages.map((item) => {
                const textColor = colorToHex(item.color);
                const bigEmoticonSize =
                  item.type === "danmaku" && item.dmType === 1 && item.emoticonOptions
                    ? getBigEmoticonSize(item.emoticonOptions)
                    : null;

                if (item.type === "superChat") {
                  const headerBg = normalizeHexColor(item.backgroundColor, "#EDF5FF");
                  const bottomBg = normalizeHexColor(item.backgroundBottomColor, "#2A60B2");
                  const priceColor = normalizeHexColor(item.backgroundPriceColor, "#7497CD");
                  const messageColor = normalizeHexColor(item.messageFontColor, "#FFFFFF");

                  return (
                    <div
                      key={`${item.roomId}-${item.id}-${item.timestamp}`}
                      className="overflow-hidden rounded-lg"
                    >
                      <div
                        className="flex items-center gap-3 border-x border-t px-3 py-2"
                        style={{
                          backgroundColor: headerBg,
                          borderColor: bottomBg,
                          backgroundImage: item.backgroundImage
                            ? `url(${item.backgroundImage})`
                            : undefined,
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "top right",
                          backgroundSize: "auto 100%"
                        }}
                      >
                        {item.avatar ? (
                          <img
                            src={item.avatar}
                            alt={item.username}
                            className="h-9 w-9 rounded-full border border-white/20 object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/30 text-slate-700">
                            💬
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                            {item.timestamp > 0 ? (
                              <span className="text-slate-500">{formatTime(item.timestamp)}</span>
                            ) : null}
                            <span className="truncate font-medium text-slate-800">{item.username}</span>
                            {item.medal ? <span className="text-cyan-700">[{item.medal}]</span> : null}
                          </div>
                        </div>

                        {item.price ? (
                          <span className="text-sm font-semibold" style={{ color: priceColor }}>
                            ¥{item.price}
                          </span>
                        ) : null}
                      </div>

                      <div
                        className="border-x border-b px-3 py-2 text-sm"
                        style={{
                          backgroundColor: bottomBg,
                          borderColor: bottomBg,
                          color: messageColor
                        }}
                      >
                        {item.content}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={`${item.roomId}-${item.id}-${item.timestamp}`}
                    className={getMessageCardClass(item.type)}
                  >
                    <div className="flex items-center gap-2 text-xs">
                      {item.timestamp > 0 && (
                        <span className="text-slate-500">{formatTime(item.timestamp)}</span>
                      )}
                      {item.type === "gift" ? <span className="text-amber-300">🎁</span> : null}
                      {item.type === "entry" ? <span className="text-slate-400">↪</span> : null}
                      <span className="font-medium text-pink-300">{item.username}</span>
                      {item.medal ? <span className="text-cyan-300">[{item.medal}]</span> : null}
                      {item.isAdmin ? <span className="text-amber-300">房管</span> : null}
                      {item.type === "gift" && item.giftName ? (
                        <span className="text-amber-200">{item.giftName}</span>
                      ) : null}
                    </div>
                    <p
                      className={getMessageTextClass(item.type)}
                      style={
                        item.type === "danmaku" && textColor ? { color: textColor } : undefined
                      }
                    >
                      {item.type === "danmaku" && item.dmType === 1 && item.emoticonOptions && bigEmoticonSize ? (
                        <span className="flex items-center justify-center py-1">
                          <img
                            src={item.emoticonOptions.url}
                            alt={item.emoticonOptions.emoticonUnique}
                            className="object-contain"
                            style={{ width: bigEmoticonSize.width, height: bigEmoticonSize.height }}
                          />
                        </span>
                      ) : item.type === "danmaku" ? (
                        renderInlineEmots(item.content, item.emots)
                      ) : (
                        item.content
                      )}
                    </p>
                  </div>
                );
              })
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

              {emoticonPickerOpen && (
                <div className="mb-3 rounded-xl border border-white/10 bg-slate-950/80 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-200">表情选择器</p>
                      <p className="text-xs text-slate-500">点击大表情后直接发送</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEmoticonPickerOpen(false)}
                      className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {loadingEmoticons ? (
                    <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-500">
                      正在加载表情列表...
                    </div>
                  ) : emoticonError ? (
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-4 text-sm text-rose-300">
                      <p>{emoticonError}</p>
                      <button
                        type="button"
                        onClick={() => void loadEmoticons()}
                        className="mt-2 text-xs text-pink-300 hover:text-pink-200"
                      >
                        重新加载
                      </button>
                    </div>
                  ) : emoticonPackages.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-500">
                      当前房间没有可用表情。
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 flex flex-wrap gap-2">
                        {emoticonPackages.map((pkg) => {
                          const active = pkg.pkgId === activePackage?.pkgId;
                          return (
                            <button
                              key={pkg.pkgId}
                              type="button"
                              onClick={() => setActivePkgId(pkg.pkgId)}
                              className={`rounded-full border px-3 py-1 text-xs transition ${
                                active
                                  ? "border-pink-400 bg-pink-500/15 text-pink-200"
                                  : "border-white/10 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                              }`}
                            >
                              {getPackageLabel(pkg)}
                            </button>
                          );
                        })}
                      </div>

                      <div className="grid max-h-64 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 xl:grid-cols-6">
                        {activePackage?.emoticons.map((emoticon, index) => {
                          const available = isEmoticonAvailable(emoticon);
                          return (
                            <button
                              key={`${activePackage.pkgId}-${emoticon.emoticonId ?? index}`}
                              type="button"
                              disabled={!available || sending}
                              onClick={() => void handleSendEmoticon(emoticon)}
                              title={emoticon.descript ?? emoticon.emoji ?? "表情"}
                              className={`flex flex-col items-center rounded-xl border p-2 text-center transition ${
                                available
                                  ? "border-white/10 bg-slate-900/70 hover:border-pink-400/40 hover:bg-slate-800"
                                  : "cursor-not-allowed border-white/5 bg-slate-900/40 opacity-50"
                              }`}
                            >
                              <img
                                src={emoticon.url}
                                alt={emoticon.descript ?? emoticon.emoji ?? "表情"}
                                className="h-12 w-12 object-contain"
                              />
                              <span className="mt-2 line-clamp-2 text-[11px] text-slate-300">
                                {emoticon.descript ?? emoticon.emoji ?? "未命名表情"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

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
