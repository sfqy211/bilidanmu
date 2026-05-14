import { useCallback, useEffect, useRef, useState } from "react";
import { tauriCommands } from "@/lib/tauri";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { useDanmakuStore } from "@/stores/danmaku-store";

interface LoopSendTickPayload {
  roomId: number;
  message: string;
  index: number;
}

interface LoopSendErrorPayload extends LoopSendTickPayload {
  error: string;
}

interface LoopSendStoppedPayload {
  reason?: string;
}

export function useScheduler(roomId: number | null) {
  const [isRunning, setIsRunning] = useState(false);
  const [lastSentMessage, setLastSentMessage] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const [loopSentCount, setLoopSentCount] = useState(0);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const incrementSentCount = useDanmakuStore((state) => state.incrementSentCount);
  const prevRoomIdRef = useRef<number | null>(roomId);

  const start = useCallback(
    async (messages: string[], intervalMs: number) => {
      if (!roomId) {
        const error = "当前房间无效";
        setLastError(error);
        throw new Error(error);
      }

      setLastError(null);
      setStopReason(null);

      try {
        await tauriCommands.danmaku.startLoop(roomId, messages, intervalMs);
        setIsRunning(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : "启动循环发送失败";
        setIsRunning(false);
        setLastError(message);
        throw error;
      }
    },
    [roomId]
  );

  const stop = useCallback(async () => {
    await tauriCommands.danmaku.stopLoop();
    setIsRunning(false);
  }, []);

  useTauriEvent<LoopSendTickPayload>("loop-send-tick", (payload) => {
    if (roomId && payload.roomId !== roomId) {
      return;
    }

    setIsRunning(true);
    setLastError(null);
    setLastSentMessage(payload.message);
    setLastIndex(payload.index);
    setLoopSentCount((count) => count + 1);
    setStopReason(null);
    incrementSentCount();
  });

  useTauriEvent<LoopSendErrorPayload>("loop-send-error", (payload) => {
    if (roomId && payload.roomId !== roomId) {
      return;
    }

    setIsRunning(false);
    setLastError(payload.error || "循环发送失败");
    setStopReason("error");
  });

  useTauriEvent<LoopSendStoppedPayload>("loop-send-stopped", (payload) => {
    setIsRunning(false);
    setStopReason(payload.reason ?? "manual");
  });

  useEffect(() => {
    const prevRoomId = prevRoomIdRef.current;
    prevRoomIdRef.current = roomId;

    if (prevRoomId !== null && roomId !== prevRoomId && isRunning) {
      void stop();
    }
  }, [isRunning, roomId, stop]);

  useEffect(() => {
    return () => {
      void tauriCommands.danmaku.stopLoop();
    };
  }, []);

  return {
    isRunning,
    lastSentMessage,
    lastError,
    lastIndex,
    loopSentCount,
    stopReason,
    start,
    stop
  };
}
