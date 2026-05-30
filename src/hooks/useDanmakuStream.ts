import { useCallback, useEffect, useRef } from "react";
import { tauriCommands } from "@/lib/tauri";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { useDanmakuStore } from "@/stores/danmaku-store";
import type { DanmakuMessage, LikeCountUpdatePayload } from "@/types/danmaku";

interface WsDisconnectedPayload {
  reason?: string;
}

interface WsErrorPayload {
  message?: string;
}

export function useDanmakuStream(roomId: number | null) {
  const addMessage = useDanmakuStore((state) => state.addMessage);
  const clearMessages = useDanmakuStore((state) => state.clearMessages);
  const setLatestLike = useDanmakuStore((state) => state.setLatestLike);
  const setLatestEntry = useDanmakuStore((state) => state.setLatestEntry);
  const setWsConnected = useDanmakuStore((state) => state.setWsConnected);
  const setWsStatus = useDanmakuStore((state) => state.setWsStatus);
  const setLastError = useDanmakuStore((state) => state.setLastError);
  const setRoomId = useDanmakuStore((state) => state.setRoomId);
  const setPopularity = useDanmakuStore((state) => state.setPopularity);
  const setTotalLikeCount = useDanmakuStore((state) => state.setTotalLikeCount);
  const setOnlineCount = useDanmakuStore((state) => state.setOnlineCount);

  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  const connectRef = useRef(() => {
    const rid = roomIdRef.current;
    if (!rid) {
      return;
    }

    setWsStatus("connecting");
    setLastError(null);
    setRoomId(rid);

    // Fire-and-forget: actual connection state is tracked via events.
    tauriCommands.ws.connect(rid).catch(() => {});
  });

  const connect = useCallback(() => connectRef.current(), []);
  const disconnect = useCallback(() => {
    tauriCommands.ws.disconnect().catch(() => {});
    setWsConnected(false);
    setWsStatus("disconnected");
  }, [setWsConnected, setWsStatus]);

  useEffect(() => {
    clearMessages();
    if (roomId) {
      void connectRef.current();
    }

    // Don't disconnect in cleanup — Rust's connect() auto-disconnects the
    // old connection, and cleanup disconnect causes stale ws-disconnected
    // events that interfere with the new connection.
  }, [roomId]);

  useTauriEvent<DanmakuMessage>("danmaku-received", (payload) => {
    if (payload.type === "like") {
      setLatestLike(payload);
      return;
    }

    if (payload.type === "entry") {
      setLatestEntry(payload);
      return;
    }

    addMessage(payload);
  });

  useTauriEvent<{ roomId: number }>("ws-connected", () => {
    setWsConnected(true);
    setWsStatus("connected");
    setLastError(null);
  });

  useTauriEvent<WsDisconnectedPayload>("ws-disconnected", (payload) => {
    // Ignore stale disconnect events from previous connections
    // (e.g., from React StrictMode cleanup or HMR)
    if (useDanmakuStore.getState().wsStatus === "connecting") {
      return;
    }
    setWsConnected(false);
    setWsStatus(payload.reason === "manual" ? "disconnected" : "reconnecting");
  });

  useTauriEvent<WsErrorPayload>("danmaku-error", (payload) => {
    setWsStatus("error");
    setLastError(payload.message ?? "弹幕流发生错误");
  });

  useTauriEvent<{ popularity: number }>("ws-heartbeat", (payload) => {
    setPopularity(payload.popularity);
  });

  useTauriEvent<LikeCountUpdatePayload>("like-count-update", (payload) => {
    const currentRoomId = useDanmakuStore.getState().roomId;
    if (currentRoomId !== null && payload.roomId === currentRoomId) {
      setTotalLikeCount(payload.clickCount);
    }
  });

  useTauriEvent<{ roomId: number; onlineCount: number }>("online-count-update", (payload) => {
    const currentRoomId = useDanmakuStore.getState().roomId;
    if (currentRoomId !== null && payload.roomId === currentRoomId) {
      setOnlineCount(payload.onlineCount);
    }
  });

  return {
    connect,
    disconnect
  };
}
