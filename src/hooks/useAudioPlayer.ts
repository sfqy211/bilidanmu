import { useCallback, useEffect, useRef, useState } from "react";
import Mpegts from "mpegts.js";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * 全局音量联动：与听视频共用 settings.audio.defaultVolume，调节后防抖写回
 * 设置（跨窗口广播 + 持久化）。写回前同值短路，联动回声不会成环。
 */
let volumeCommitTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleGlobalVolumeCommit(volume100: number) {
  if (volumeCommitTimer) clearTimeout(volumeCommitTimer);
  volumeCommitTimer = setTimeout(() => {
    volumeCommitTimer = null;
    const { settings, patchSettings, saveSettings } = useSettingsStore.getState();
    if (settings.audio.defaultVolume === volume100) return;
    patchSettings({ audio: { ...settings.audio, defaultVolume: volume100 } });
    void saveSettings();
  }, 400);
}

interface AudioPlayerState {
  isPlaying: boolean;
  isConnecting: boolean;
  volume: number;
  error: string | null;
}

/** 重连初始退避 */
const RECONNECT_DELAY_MS = 4000;
/** 重连退避上限：房间在线期间无限重试，最快 30 秒一次 */
const RECONNECT_MAX_DELAY_MS = 30_000;
/** 停滞看门狗巡检周期 */
const WATCHDOG_INTERVAL_MS = 5000;
/** 播放中 currentTime 连续无推进超过该时长视为静默断流（缓冲耗尽/上游断开不触发 ERROR） */
const WATCHDOG_STALL_MS = 15_000;

export function useAudioPlayer(roomId: number | null, defaultVolume = 0.8) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerRef = useRef<Mpegts.Player | null>(null);
  const volumeRef = useRef(defaultVolume);
  const reconnectDelayRef = useRef(RECONNECT_DELAY_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destroyedRef = useRef(false);
  const mutedRef = useRef(false);
  /** 本会话是否成功播放过：区分"初始连接失败"（停止并报错）与"会话中断流"（无限退避重连） */
  const hasPlayedRef = useRef(false);
  const stallRef = useRef<{ time: number; at: number }>({ time: 0, at: Date.now() });
  const playRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    isConnecting: false,
    volume: defaultVolume,
    error: null,
  });
  const [isMuted, setMuted] = useState(false);

  // 静音走 audio.muted 瞬态开关：不改音量数值、不写回全局音量设置，解除即回原值
  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    if (audioRef.current) {
      audioRef.current.muted = next;
    }
    setMuted(next);
  }, []);

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
        // 防御：portal 卸载顺序极端情况下 audio 元素可能已不可用
        if (audioRef.current) {
          player.detachMediaElement();
        }
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
    reconnectDelayRef.current = RECONNECT_DELAY_MS;
    hasPlayedRef.current = false;

    return () => {
      void destroyPlayerAndClearStream();
    };
  }, [roomId, destroyPlayerAndClearStream]);

  // 统一的重连调度：房间在线期间无限指数退避，切房/退出（destroyed）后停止
  const scheduleReconnect = useCallback(
    (reason: string) => {
      if (destroyedRef.current) return;
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, RECONNECT_MAX_DELAY_MS);
      console.warn(`[audio] ${reason}，${delay / 1000}s 后重连`);
      destroyPlayer();
      setState((prev) => ({ ...prev, isPlaying: false, isConnecting: true, error: reason }));
      reconnectTimerRef.current = setTimeout(() => {
        if (!destroyedRef.current) void playRef.current();
      }, delay);
    },
    [destroyPlayer]
  );

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
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      const streamInfo = await tauriCommands.room.getAudioStreamUrl(roomId);

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
        scheduleReconnect(`音频流错误：${msg}`);
      });
      // 上游（CDN/代理）断开时直播流会"正常"结束，不触发 ERROR，必须单独接住
      player.on(Mpegts.Events.LOADING_COMPLETE, () => {
        scheduleReconnect("直播流被上游关闭");
      });

      player.attachMediaElement(audio);
      player.load();
      playerRef.current = player;
      stallRef.current = { time: 0, at: Date.now() };

      // 播放前设置音量与静音态
      audio.volume = volumeRef.current;
      audio.muted = mutedRef.current;

      try {
        await player.play();
      } catch (playError) {
        // AbortError 在 React Strict Mode 或快速重连时可能出现，忽略即可
        if (playError instanceof DOMException && playError.name === "AbortError") {
          console.warn("[audio] play() aborted (likely interrupted), ignoring");
        } else {
          throw playError;
        }
      }
      reconnectDelayRef.current = RECONNECT_DELAY_MS;
      hasPlayedRef.current = true;
      setState((prev) => ({ ...prev, isPlaying: true, isConnecting: false }));
    } catch (error) {
      console.error("[audio] play failed:", error);
      const reason = error instanceof Error ? error.message : "获取音频流失败";
      // 未开播/无流是确定态，重试无意义；初始连接失败也直接停在错误态
      // （避免未开播房间无限重试导致播放按钮永远转圈）。
      // 会话中已成功播放过的网络类失败仍走无限退避重连。
      if (!hasPlayedRef.current || /未开播|缺少流信息/.test(reason)) {
        setState((prev) => ({ ...prev, isPlaying: false, isConnecting: false, error: reason }));
        return;
      }
      scheduleReconnect(`获取音频流失败：${reason}`);
    }
  }, [roomId, destroyPlayer, scheduleReconnect]);

  playRef.current = play;

  // 停滞看门狗：兜住不报错的死流（隐藏窗口节流、缓冲耗尽、CDN 静默断开）
  useEffect(() => {
    const timer = setInterval(() => {
      const audio = audioRef.current;
      if (!audio || destroyedRef.current || !playerRef.current || audio.paused) return;
      const now = Date.now();
      if (audio.currentTime !== stallRef.current.time) {
        stallRef.current = { time: audio.currentTime, at: now };
        return;
      }
      if (now - stallRef.current.at >= WATCHDOG_STALL_MS) {
        // 重连前先刷新水位，避免 destroyPlayer 尚未生效时重复触发
        stallRef.current = { time: audio.currentTime, at: now };
        scheduleReconnect("缓冲停滞（播放进度长时间无推进）");
      }
    }, WATCHDOG_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [scheduleReconnect]);

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
    // 同值短路：拖动重复 tick 与联动回声不再触发写回
    if (volumeRef.current === clamped) return;
    volumeRef.current = clamped;
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
    setState((prev) => ({ ...prev, volume: clamped }));
    scheduleGlobalVolumeCommit(Math.round(clamped * 100));
  }, []);

  return {
    audioRef,
    isPlaying: state.isPlaying,
    isConnecting: state.isConnecting,
    isMuted,
    volume: state.volume,
    error: state.error,
    play,
    stop,
    setVolume,
    toggleMute,
  };
}
