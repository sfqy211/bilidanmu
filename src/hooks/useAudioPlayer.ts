import { useCallback, useEffect, useRef, useState } from "react";
import Mpegts from "mpegts.js";
import { tauriCommands } from "@/lib/tauri";

interface AudioPlayerState {
  isPlaying: boolean;
  isConnecting: boolean;
  volume: number;
  error: string | null;
}

const RECONNECT_DELAY_MS = 4000;
const MAX_RECONNECT_ATTEMPTS = 3;

export function useAudioPlayer(roomId: number | null, defaultVolume = 0.8) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerRef = useRef<Mpegts.Player | null>(null);
  const volumeRef = useRef(defaultVolume);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destroyedRef = useRef(false);

  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    isConnecting: false,
    volume: defaultVolume,
    error: null,
  });

  // 设置变化时同步音量
  useEffect(() => {
    volumeRef.current = defaultVolume;
    if (audioRef.current) {
      audioRef.current.volume = defaultVolume;
    }
    setState((prev) => ({ ...prev, volume: defaultVolume }));
  }, [defaultVolume]);

  const destroyPlayer = useCallback(() => {
    // 取消待处理的重连
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const player = playerRef.current;
    if (player) {
      try {
        player.pause();
        player.unload();
        player.detachMediaElement();
        player.destroy();
      } catch {
        // 播放器销毁时可能已处于异常状态
      }
      playerRef.current = null;
    }
    setState((prev) => ({ ...prev, isPlaying: false, isConnecting: false }));
  }, []);

  // 通知 Rust 端清除 CDN 流 URL 并销毁前端播放器
  const destroyPlayerAndClearStream = useCallback(async () => {
    destroyedRef.current = true;
    destroyPlayer();

    try {
      await tauriCommands.room.clearAudioStream();
    } catch {
      // 忽略清理错误
    }
  }, [destroyPlayer]);

  // 房间切换时：先清 Rust 端 CDN 连接，再销毁前端
  useEffect(() => {
    destroyedRef.current = false;
    reconnectAttemptRef.current = 0;

    return () => {
      void destroyPlayerAndClearStream();
    };
  }, [roomId, destroyPlayerAndClearStream]);

  const play = useCallback(async () => {
    if (!roomId) return;

    // 先清理旧播放器和旧流
    destroyPlayer();
    try {
      await tauriCommands.room.clearAudioStream();
    } catch {
      // ignore
    }

    destroyedRef.current = false;
    reconnectAttemptRef.current = 0;
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      const streamInfo = await tauriCommands.room.getAudioStreamUrl(roomId);
      console.log("[audio] streamInfo:", streamInfo);

      const audio = audioRef.current;
      if (!audio) {
        setState((prev) => ({ ...prev, isConnecting: false, error: "音频元素未就绪" }));
        return;
      }

      if (!Mpegts.isSupported()) {
        setState((prev) => ({ ...prev, isConnecting: false, error: "浏览器不支持 MSE" }));
        return;
      }

      const player = Mpegts.createPlayer(
        {
          type: "flv",
          isLive: true,
          url: streamInfo.proxyUrl,
        },
        {
          enableStashBuffer: false,
          stashInitialSize: 128,
          autoCleanupSourceBuffer: true,
        }
      );

      player.on(Mpegts.Events.ERROR, (errorType, errorDetail, errorInfo) => {
        console.error("[audio] mpegts error:", errorType, errorDetail, errorInfo);
        const msg =
          (errorInfo as { msg?: string } | undefined)?.msg || "音频流错误";

        // 自动重连（最多 MAX_RECONNECT_ATTEMPTS 次）
        if (!destroyedRef.current && reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptRef.current += 1;
          setState((prev) => ({
            ...prev,
            isPlaying: false,
            isConnecting: true,
            error: null,
          }));

          reconnectTimerRef.current = setTimeout(() => {
            if (!destroyedRef.current) {
              void play();
            }
          }, RECONNECT_DELAY_MS);
        } else {
          setState((prev) => ({
            ...prev,
            isPlaying: false,
            isConnecting: false,
            error: msg,
          }));
        }
      });

      player.attachMediaElement(audio);
      player.load();
      playerRef.current = player;

      // 播放前设置音量
      audio.volume = volumeRef.current;

      await player.play();
      console.log("[audio] playback started, proxyUrl:", streamInfo.proxyUrl);
      reconnectAttemptRef.current = 0;
      setState((prev) => ({ ...prev, isPlaying: true, isConnecting: false }));
    } catch (error) {
      console.error("[audio] play failed:", error);
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: error instanceof Error ? error.message : "获取音频流失败",
      }));
    }
  }, [roomId, destroyPlayer]);

  const stop = useCallback(async () => {
    destroyPlayer();
    try {
      await tauriCommands.room.clearAudioStream();
    } catch {
      // 忽略清理错误
    }
  }, [destroyPlayer]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    volumeRef.current = clamped;
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
    setState((prev) => ({ ...prev, volume: clamped }));
  }, []);

  return {
    audioRef,
    isPlaying: state.isPlaying,
    isConnecting: state.isConnecting,
    volume: state.volume,
    error: state.error,
    play,
    stop,
    setVolume,
  };
}
