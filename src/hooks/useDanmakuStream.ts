import { useCallback, useEffect } from "react";
import { tauriCommands } from "@/lib/tauri";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { useDanmakuStore } from "@/stores/danmaku-store";
import type { DanmakuMessage } from "@/types/danmaku";

interface WsDisconnectedPayload {
  reason?: string;
}

interface WsErrorPayload {
  message?: string;
}

export function useDanmakuStream(roomId: number | null) {
  const addMessage = useDanmakuStore((state) => state.addMessage);
  const clearMessages = useDanmakuStore((state) => state.clearMessages);
  const setWsConnected = useDanmakuStore((state) => state.setWsConnected);
  const setWsStatus = useDanmakuStore((state) => state.setWsStatus);
  const setLastError = useDanmakuStore((state) => state.setLastError);
  const setRoomId = useDanmakuStore((state) => state.setRoomId);

  const connect = useCallback(async () => {
    if (!roomId) {
      return;
    }

    setWsStatus("connecting");
    setLastError(null);
    setRoomId(roomId);

    try {
      await tauriCommands.ws.connect(roomId);
    } catch (error) {
      setWsStatus("error");
      setWsConnected(false);
      setLastError(error instanceof Error ? error.message : "连接弹幕流失败");
    }
  }, [roomId, setLastError, setRoomId, setWsConnected, setWsStatus]);

  const disconnect = useCallback(async () => {
    try {
      await tauriCommands.ws.disconnect();
    } finally {
      setWsConnected(false);
      setWsStatus("disconnected");
    }
  }, [setWsConnected, setWsStatus]);

  useEffect(() => {
    clearMessages();
    if (roomId) {
      void connect();
    }

    return () => {
      void disconnect();
    };
  }, [clearMessages, connect, disconnect, roomId]);

  useTauriEvent<DanmakuMessage>("danmaku-received", (payload) => {
    addMessage(payload);
  });

  useTauriEvent<{ roomId: number }>("ws-connected", () => {
    setWsConnected(true);
    setWsStatus("connected");
    setLastError(null);
  });

  useTauriEvent<WsDisconnectedPayload>("ws-disconnected", (payload) => {
    setWsConnected(false);
    setWsStatus(payload.reason === "manual" ? "disconnected" : "reconnecting");
  });

  useTauriEvent<WsErrorPayload>("danmaku-error", (payload) => {
    setWsStatus("error");
    setLastError(payload.message ?? "弹幕流发生错误");
  });

  return {
    connect,
    disconnect
  };
}
