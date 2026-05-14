import { useCallback, useState } from "react";
import { tauriCommands } from "@/lib/tauri";
import { useTauriEvent } from "@/hooks/useTauriEvent";

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

  const start = useCallback(
    async (messages: string[], intervalMs: number) => {
      if (!roomId) {
        const error = "当前房间无效";
        setLastError(error);
        throw new Error(error);
      }

      setLastError(null);

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
  });

  useTauriEvent<LoopSendErrorPayload>("loop-send-error", (payload) => {
    if (roomId && payload.roomId !== roomId) {
      return;
    }

    setIsRunning(false);
    setLastError(payload.error || "循环发送失败");
  });

  useTauriEvent<LoopSendStoppedPayload>("loop-send-stopped", () => {
    setIsRunning(false);
  });

  return {
    isRunning,
    lastSentMessage,
    lastError,
    start,
    stop
  };
}
