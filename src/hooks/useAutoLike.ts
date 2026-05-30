import { useCallback, useEffect, useRef, useState } from "react";
import { tauriCommands } from "@/lib/tauri";
import { useTauriEvent } from "@/hooks/useTauriEvent";

interface AutoLikeTickPayload {
  roomId: number;
  sentTotal: number;
  targetTotal: number;
}

interface AutoLikeErrorPayload {
  roomId: number;
  sentTotal: number;
  error: string;
}

interface AutoLikeStoppedPayload {
  reason?: string;
  sentTotal?: number;
}

export function useAutoLike(roomId: number | null) {
  const [isRunning, setIsRunning] = useState(false);
  const [sentTotal, setSentTotal] = useState(0);
  const [targetTotal, setTargetTotal] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const prevRoomIdRef = useRef<number | null>(roomId);
  const isRunningRef = useRef(isRunning);
  isRunningRef.current = isRunning;

  const start = useCallback(
    async (anchorId: number, target: number, batchSize: number, intervalMs: number) => {
      if (!roomId) {
        const error = "当前房间无效";
        setLastError(error);
        throw new Error(error);
      }

      setLastError(null);
      setStopReason(null);
      setSentTotal(0);
      setTargetTotal(target);

      try {
        await tauriCommands.danmaku.startAutoLike(roomId, anchorId, target, batchSize, intervalMs);
        setIsRunning(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : "启动自动点赞失败";
        setIsRunning(false);
        setLastError(message);
        throw error;
      }
    },
    [roomId]
  );

  const stop = useCallback(async () => {
    await tauriCommands.danmaku.stopAutoLike();
    setIsRunning(false);
  }, []);

  useTauriEvent<AutoLikeTickPayload>("auto-like-tick", (payload) => {
    if (roomId && payload.roomId !== roomId) return;

    setIsRunning(true);
    setLastError(null);
    setSentTotal(payload.sentTotal);
    setTargetTotal(payload.targetTotal);
    setStopReason(null);
  });

  useTauriEvent<AutoLikeErrorPayload>("auto-like-error", (payload) => {
    if (roomId && payload.roomId !== roomId) return;

    setIsRunning(false);
    setLastError(payload.error || "自动点赞失败");
    setStopReason("error");
  });

  useTauriEvent<AutoLikeStoppedPayload>("auto-like-stopped", (payload) => {
    setIsRunning(false);
    setStopReason(payload.reason ?? "manual");
    if (payload.sentTotal !== undefined) {
      setSentTotal(payload.sentTotal);
    }
  });

  useEffect(() => {
    const prevRoomId = prevRoomIdRef.current;
    prevRoomIdRef.current = roomId;

    if (prevRoomId !== null && roomId !== prevRoomId) {
      if (isRunning) void stop();
      setSentTotal(0);
      setTargetTotal(0);
      setLastError(null);
      setStopReason(null);
    }
  }, [isRunning, roomId, stop]);

  useEffect(() => {
    return () => {
      if (isRunningRef.current) {
        void tauriCommands.danmaku.stopAutoLike();
      }
    };
  }, []);

  return {
    isRunning,
    sentTotal,
    targetTotal,
    lastError,
    stopReason,
    start,
    stop,
  };
}
