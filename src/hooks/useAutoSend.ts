import { useCallback, useEffect, useRef, useState } from "react";
import { tauriCommands } from "@/lib/tauri";
import type { AutoSendEntry } from "@/lib/tauri";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { useDanmakuStore } from "@/stores/danmaku-store";

interface AutoSendTickPayload {
  roomId: number;
  message: string;
  dmType: number;
  index: number;
}

interface AutoSendErrorPayload extends AutoSendTickPayload {
  error: string;
}

interface AutoSendStoppedPayload {
  reason?: string;
}

export function useAutoSend(roomId: number | null) {
  const [isRunning, setIsRunning] = useState(false);
  const [lastSentMessage, setLastSentMessage] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const incrementSentCount = useDanmakuStore((state) => state.incrementSentCount);
  const prevRoomIdRef = useRef<number | null>(roomId);

  const start = useCallback(
    async (entries: AutoSendEntry[], intervalMs: number, timeLimitSecs?: number) => {
      if (!roomId) {
        const error = "当前房间无效";
        setLastError(error);
        throw new Error(error);
      }

      if (entries.length === 0) {
        const error = "自动发送内容不能为空";
        setLastError(error);
        throw new Error(error);
      }

      setLastError(null);
      setStopReason(null);

      try {
        await tauriCommands.danmaku.startAutoSend(roomId, entries, intervalMs, timeLimitSecs);
        setIsRunning(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : "启动自动发送失败";
        setIsRunning(false);
        setLastError(message);
        throw error;
      }
    },
    [roomId]
  );

  const stop = useCallback(async () => {
    await tauriCommands.danmaku.stopAutoSend();
    setIsRunning(false);
  }, []);

  useTauriEvent<AutoSendTickPayload>("auto-send-tick", (payload) => {
    if (roomId && payload.roomId !== roomId) {
      return;
    }

    setIsRunning(true);
    setLastError(null);
    setLastSentMessage(payload.message);
    setLastIndex(payload.index);
    setSentCount((count) => count + 1);
    setStopReason(null);
    incrementSentCount();
  });

  useTauriEvent<AutoSendErrorPayload>("auto-send-error", (payload) => {
    if (roomId && payload.roomId !== roomId) {
      return;
    }

    setIsRunning(false);
    setLastError(payload.error || "自动发送失败");
    setStopReason("error");
  });

  useTauriEvent<AutoSendStoppedPayload>("auto-send-stopped", (payload) => {
    setIsRunning(false);
    setStopReason(payload.reason ?? "manual");
  });

  // 切换房间时自动停止并重置计数
  useEffect(() => {
    const prevRoomId = prevRoomIdRef.current;
    prevRoomIdRef.current = roomId;

    if (prevRoomId !== null && roomId !== prevRoomId) {
      if (isRunning) {
        void stop();
      }
      setSentCount(0);
      setLastSentMessage(null);
      setLastError(null);
      setLastIndex(null);
      setStopReason(null);
    }
  }, [isRunning, roomId, stop]);

  // 组件卸载时停止
  useEffect(() => {
    return () => {
      void tauriCommands.danmaku.stopAutoSend();
    };
  }, []);

  return {
    isRunning,
    lastSentMessage,
    lastError,
    lastIndex,
    sentCount,
    stopReason,
    start,
    stop
  };
}
