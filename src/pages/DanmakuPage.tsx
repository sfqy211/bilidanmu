import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowDown, Pause, Play, Send, Smile, Volume2, VolumeX, Zap } from "lucide-react";
import { AutoSendPanel } from "@/components/danmaku/AutoSendPanel";
import { DanmakuMessageItem } from "@/components/danmaku/DanmakuMessageItem";
import { EmoticonPickerPanel } from "@/components/danmaku/EmoticonPickerPanel";
import { SubtitleOverlay } from "@/components/danmaku/SubtitleOverlay";
import { SuperChatCard } from "@/components/danmaku/SuperChatCard";
import { useDanmaku } from "@/hooks/useDanmaku";
import { useAutoSend } from "@/hooks/useAutoSend";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useDanmakuStream } from "@/hooks/useDanmakuStream";
import { useSttTranscript } from "@/hooks/useSttTranscript";
import { tauriCommands } from "@/lib/tauri";
import { useDanmakuStore } from "@/stores/danmaku-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { Emoticon, EmoticonPackage } from "@/types/bilibili";
import { makePkgKey } from "@/types/bilibili";

function serializeEmoticonOptions(emoticon: Emoticon): string | undefined {
  if (emoticon.emoticonOptions) {
    return JSON.stringify(emoticon.emoticonOptions);
  }

  if (!emoticon.emoticonUnique) {
    return undefined;
  }

  return JSON.stringify({ emoticon_unique: emoticon.emoticonUnique });
}

export function DanmakuPage() {
  const { roomId: roomIdParam } = useParams();
  const roomId = useMemo(() => Number(roomIdParam ?? 0) || null, [roomIdParam]);
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputBarRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [emoticonPickerOpen, setEmoticonPickerOpen] = useState(false);
  const [emoticonPackages, setEmoticonPackages] = useState<EmoticonPackage[]>([]);
  const [loadingEmoticons, setLoadingEmoticons] = useState(false);
  const [emoticonError, setEmoticonError] = useState<string | null>(null);
  const [activePkgKey, setActivePkgKey] = useState<string | null>(null);
  const [autoSendOpen, setAutoSendOpen] = useState(false);
  const { disconnect } = useDanmakuStream(roomId);

  const messages = useDanmakuStore((state) => state.messages);
  const { send, sendEmoticon, sending } = useDanmaku();
  const {
    audioRef,
    isPlaying: audioPlaying,
    isConnecting: audioConnecting,
    volume: audioVolume,
    error: audioError,
    play: audioPlay,
    stop: audioStop,
    setVolume: audioSetVolume,
  } = useAudioPlayer(roomId);

  const sttSettings = useSettingsStore((s) => s.settings.stt);
  const { currentText: sttText, isSpeaking: sttSpeaking } = useSttTranscript(sttSettings.syncDelayMs);

  const handleAudioPlay = useCallback(async () => {
    await audioPlay();
    if (sttSettings.enabled) {
      try { await tauriCommands.stt.start(); } catch { /* STT may not have models */ }
    }
  }, [audioPlay, sttSettings.enabled]);

  const handleAudioStop = useCallback(async () => {
    await audioStop();
    try { await tauriCommands.stt.stop(); } catch { /* ignore */ }
  }, [audioStop]);

  // Cleanup STT pipeline on unmount
  useEffect(() => {
    return () => {
      tauriCommands.stt.stop().catch(() => {});
    };
  }, []);

  // Disconnect WebSocket and stop STT when the window close is requested
  // (the window is hidden via prevent_close(), so React never unmounts)
  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(() => {
      disconnect();
      tauriCommands.stt.stop().catch(() => {});
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [disconnect]);
  const {
    isRunning: autoSendRunning,
    lastSentMessage,
    lastError: autoSendError,
    lastIndex,
    sentCount,
    stopReason,
    start: startAutoSend,
    stop: stopAutoSend
  } = useAutoSend(roomId);

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

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (inputBarRef.current?.contains(target)) {
        return;
      }

      setEmoticonPickerOpen(false);
      setAutoSendOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const loadEmoticons = useCallback(async () => {
    if (!roomId) {
      return;
    }

    setLoadingEmoticons(true);
    setEmoticonError(null);

    try {
      const packages = await tauriCommands.room.getEmoticons(roomId);
      setEmoticonPackages(packages);
      setActivePkgKey((current) => {
        if (current && packages.some((pkg) => makePkgKey(pkg) === current)) {
          return current;
        }
        return packages[0] ? makePkgKey(packages[0]) : null;
      });
    } catch (error) {
      setEmoticonError(error instanceof Error ? error.message : "加载表情失败");
    } finally {
      setLoadingEmoticons(false);
    }
  }, [roomId]);

  const handleToggleEmoticonPicker = useCallback(async () => {
    const nextOpen = !emoticonPickerOpen;
    if (nextOpen) {
      setAutoSendOpen(false);
    }
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



  return (
    <main className="flex h-screen flex-col overflow-hidden border border-slate-300 bg-slate-100 text-slate-900 dark:border-white/[0.06] dark:bg-[#0a0c14] dark:text-slate-100">
        {/* 音频控制栏 */}
        <div className="flex items-center gap-2 border-b border-slate-300 bg-white px-3 py-1 dark:border-white/[0.06] dark:bg-[#12141e]">
          <button
            type="button"
            onClick={() => void (audioPlaying ? handleAudioStop() : handleAudioPlay())}
            disabled={!roomId || audioConnecting}
            className={`flex h-6 w-6 items-center justify-center transition ${
              audioPlaying
                ? "text-pink-500 hover:text-pink-400"
                : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            } disabled:cursor-not-allowed disabled:opacity-50`}
            title={audioPlaying ? "停止音频" : "播放音频"}
          >
            {audioConnecting ? (
              <span className="block h-3 w-3 animate-spin rounded-full border-2 border-pink-500 border-t-transparent" />
            ) : audioPlaying ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => audioSetVolume(audioVolume === 0 ? 0.8 : 0)}
            className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          >
            {audioVolume === 0 ? (
              <VolumeX className="h-3.5 w-3.5" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
          </button>

          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(audioVolume * 100)}
            onChange={(e) => audioSetVolume(Number(e.target.value) / 100)}
            className="h-1 w-16 cursor-pointer accent-pink-500"
          />

          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {audioError
              ? audioError.length > 24
                ? `${audioError.slice(0, 24)}…`
                : audioError
              : audioConnecting
                ? "连接中…"
                : audioPlaying
                  ? "播放中"
                  : "音频"}
          </span>
        </div>

        {/* 隐藏音频元素 */}
        <audio ref={audioRef} className="hidden" />

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">

          <div
            ref={scrollRef}
            onScroll={checkAtBottom}
            className="flex flex-1 flex-col gap-2 overflow-y-auto p-5"
          >
            {messages.length === 0 ? (
              <div className="border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-400 dark:border-white/[0.06] dark:bg-[#0c0e18] dark:text-slate-500">
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
              className="absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 bg-pink-500 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-pink-400"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              回到底部
            </button>
          )}

          <SubtitleOverlay text={sttText} isSpeaking={sttSpeaking} />
        </div>

        <div className="border-t border-slate-300 bg-white p-3 dark:border-white/[0.06] dark:bg-[#12141e]">
          <div ref={inputBarRef} className="relative flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAutoSendOpen((value) => {
                  const next = !value;
                  if (next) {
                    setEmoticonPickerOpen(false);
                  }
                  return next;
                });
              }}
              className={`flex h-10 w-10 items-center justify-center border transition ${
                autoSendRunning
                  ? "border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "border-slate-300 bg-white text-slate-500 hover:bg-slate-100 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-slate-300 dark:hover:bg-white/[0.04]"
              }`}
              title="自动发送"
            >
              <Zap className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleToggleEmoticonPicker()}
              disabled={!roomId || sending}
              className="flex h-10 w-10 items-center justify-center border border-slate-300 bg-white text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-slate-300 dark:hover:bg-white/[0.04]"
              title="表情"
            >
              <Smile className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              {emoticonPickerOpen ? (
                <EmoticonPickerPanel
                  className="absolute bottom-full left-0 right-0 z-20 mb-2 w-[min(100%,520px)]"
                  loading={loadingEmoticons}
                  error={emoticonError}
                  packages={emoticonPackages}
                  activePkgKey={activePkgKey}
                  sending={sending}
                  onClose={() => setEmoticonPickerOpen(false)}
                  onReload={() => void loadEmoticons()}
                  onSelectPackage={setActivePkgKey}
                  onSelectEmoticon={(emoticon) => void handleSendEmoticon(emoticon)}
                />
              ) : null}

              {autoSendOpen ? (
                <AutoSendPanel
                  className="absolute bottom-full left-0 right-0 z-20 mb-2 w-[min(100%,520px)]"
                  isRunning={autoSendRunning}
                  lastSentMessage={lastSentMessage}
                  lastIndex={lastIndex}
                  sentCount={sentCount}
                  stopReason={stopReason}
                  error={autoSendError}
                  emoticonPackages={emoticonPackages}
                  onStart={startAutoSend}
                  onStop={() => void stopAutoSend()}
                  onClose={() => setAutoSendOpen(false)}
                />
              ) : null}

              <input
                value={message}
                onChange={(event) => setMessage(event.target.value.slice(0, 20))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="输入要发送的弹幕内容，最多 20 字"
                className="h-10 w-full border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
            <button
              onClick={() => void handleSend()}
              disabled={!roomId || !message.trim() || sending}
              className="flex h-10 w-10 items-center justify-center bg-pink-500 text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
              title={sending ? "发送中" : "发送"}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </main>
  );
}
