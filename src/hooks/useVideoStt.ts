import { useTranslation as useDesktopTranslation } from "@/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { tauriCommands } from "@/lib/tauri";
import type {
  SubtitleLine,
  VideoSttEvent,
  VideoSttPhase,
  VideoSttTrack,
} from "@/types/bilibili";

export type VideoSttStatus = "idle" | VideoSttPhase;

const BUSY_PHASES: VideoSttPhase[] = ["downloading", "decoding", "recognizing"];

/**
 * 视频整段语音识别（仅当前会话内缓存）。
 *
 * - 切换 bvid/cid 或组件卸载时立即取消后台识别；
 * - 只有调用 `start()` 才会真正开始，不会因切视频自动触发；
 * - 已完成的轨道来自 Rust 侧会话缓存，秒开。
 */
export function useVideoStt(bvid?: string | null, cid?: number | null, enabled = true) {
  const { t: translate } = useDesktopTranslation("desktop");
  const [lines, setLines] = useState<SubtitleLine[]>([]);
  const [status, setStatus] = useState<VideoSttStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [track, setTrack] = useState<VideoSttTrack | null>(null);

  const runningRef = useRef(false);
  const identityRef = useRef("");
  identityRef.current = bvid && cid != null ? `${bvid}:${cid}` : "";

  useEffect(() => {
    if (!enabled || !bvid || cid == null) {
      setLines([]);
      setStatus("idle");
      setProgress(0);
      setError(null);
      setTrack(null);
      return;
    }
    let cancelled = false;
    setLines([]);
    setStatus("idle");
    setProgress(0);
    setError(null);
    setTrack(null);

    void tauriCommands.video
      .getStt(bvid, cid)
      .then((cached) => {
        if (cancelled || !cached) return;
        setTrack(cached);
        setLines(cached.lines);
        setStatus("done");
        setProgress(1);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      // 切换视频 / 离开页面：立即取消，不在后台继续跑
      if (runningRef.current) {
        runningRef.current = false;
        void tauriCommands.video.stopStt().catch(() => {});
      }
    };
  }, [enabled, bvid, cid]);

  useTauriEvent<VideoSttEvent>("video-stt", (payload) => {
    if (!enabled || `${payload.bvid}:${payload.cid}` !== identityRef.current) return;
    // 重新识别时旧任务的取消事件可能晚到；新任务已开始就不要回退状态
    if (payload.phase === "cancelled" && runningRef.current) return;

    // 带 line 的事件只追加字幕，不改进度（后端识别中会穿插进度事件）
    if (payload.line) {
      setLines((previous) => [...previous, payload.line!]);
    } else {
      setProgress(payload.progress);
    }
    setStatus(payload.phase);

    switch (payload.phase) {
      case "done":
        runningRef.current = false;
        // 从缓存取完整轨道（本窗口可能是识别中途才打开的）
        if (bvid && cid != null) {
          void tauriCommands.video
            .getStt(bvid, cid)
            .then((cached) => {
              if (!cached || identityRef.current !== `${cached.bvid}:${cached.cid}`) return;
              setTrack(cached);
              setLines(cached.lines);
              setProgress(1);
            })
            .catch(() => {});
        }
        break;
      case "error":
        runningRef.current = false;
        setError(payload.message ?? translate("speech.failed"));
        break;
      case "cancelled":
        runningRef.current = false;
        break;
      default:
        runningRef.current = true;
    }
  });

  const start = useCallback(async () => {
    if (!bvid || cid == null || runningRef.current) return;
    runningRef.current = true;
    setStatus("downloading");
    setProgress(0);
    setError(null);
    setLines([]);
    setTrack(null);
    try {
      await tauriCommands.video.startStt(bvid, cid);
    } catch (reason) {
      runningRef.current = false;
      setStatus("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [bvid, cid]);

  const stop = useCallback(async () => {
    if (!runningRef.current) return;
    runningRef.current = false;
    setStatus("cancelled");
    await tauriCommands.video.stopStt().catch(() => {});
  }, []);

  /** 清除缓存并从头重新识别。 */
  const restart = useCallback(async () => {
    if (!bvid || cid == null) return;
    if (runningRef.current) {
      runningRef.current = false;
      await tauriCommands.video.stopStt().catch(() => {});
    }
    await tauriCommands.video.clearStt(bvid, cid).catch(() => {});
    await start();
  }, [bvid, cid, start]);

  return {
    lines,
    status,
    progress,
    error,
    track,
    busy: BUSY_PHASES.includes(status as VideoSttPhase),
    start,
    stop,
    restart,
  };
}
