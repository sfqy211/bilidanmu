import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Send, Wifi, WifiOff } from "lucide-react";
import { useDanmaku } from "@/hooks/useDanmaku";
import { useDanmakuStream } from "@/hooks/useDanmakuStream";
import { useDanmakuStore } from "@/stores/danmaku-store";

const statusTextMap = {
  idle: "未连接",
  connecting: "连接中",
  connected: "已连接",
  reconnecting: "重连中",
  disconnected: "已断开",
  error: "连接异常"
} as const;

export function DanmakuPage() {
  const { roomId: roomIdParam } = useParams();
  const roomId = useMemo(() => Number(roomIdParam ?? 0) || null, [roomIdParam]);
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useDanmakuStream(roomId);

  const messages = useDanmakuStore((state) => state.messages);
  const wsConnected = useDanmakuStore((state) => state.wsConnected);
  const wsStatus = useDanmakuStore((state) => state.wsStatus);
  const lastError = useDanmakuStore((state) => state.lastError);
  const sentCount = useDanmakuStore((state) => state.sentCount);
  const { send, sending } = useDanmaku();

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!roomId || !message.trim()) {
      return;
    }

    await send(roomId, message.trim());
    setMessage("");
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
          <p className="mt-3 text-sm text-slate-400">已发送 {sentCount} 条弹幕</p>
          {lastError ? <p className="mt-3 text-sm text-rose-400">{lastError}</p> : null}
        </div>
      </aside>

      <main className="flex min-h-0 flex-col p-6">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-5 py-4 text-sm text-slate-400">实时弹幕流</div>
          <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
            {messages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/30 p-6 text-sm text-slate-500">
                暂无弹幕，连接成功后会在这里实时显示。
              </div>
            ) : (
              messages.map((item) => (
                <div key={`${item.roomId}-${item.id}-${item.timestamp}`} className="rounded-xl bg-slate-950/50 p-4">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-pink-300">{item.username}</span>
                    {item.medal ? <span className="text-xs text-cyan-300">[{item.medal}]</span> : null}
                    {item.isAdmin ? <span className="text-xs text-amber-300">房管</span> : null}
                  </div>
                  <p className="mt-2 break-words text-sm text-slate-100">{item.content}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/90 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="mb-2 block text-sm text-slate-400">发送弹幕</label>
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
      </main>
    </div>
  );
}
