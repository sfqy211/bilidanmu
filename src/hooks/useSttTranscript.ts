import { useCallback, useEffect, useRef, useState } from "react";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import type { SttTranscript } from "@/types/bilibili";

/**
 * 字幕与音频播放对齐调度。
 *
 * Rust 侧为每条 transcript 打上音频流内时间戳（audioTsMs，自 tee 连接起点起算），
 * 前端用一对锚点（首条 transcript 的 audioTsMs ↔ 当时的 audio.currentTime）把
 * 「识别时间轴」粘合到「播放时间轴」上：显示时刻由播放进度决定而非墙钟。
 * 暂停时字幕自然冻结；tee 重连（epoch 变化）时清空状态并重新锚定。
 */

/** 字幕提前量：句锚点取「已喂入音频的终点」，略晚于句首，用提前量补足 */
const LEAD_MS = 250;
/** final 句尾音频播出后的保留时长 */
const HOLD_MS = 1200;
/** 淡出时长（isSpeaking=false 后渐隐，衔接 SubtitleOverlay 的过渡） */
const FADE_OUT_MS = 800;
/** partial 句兜底过期：识别断流时字幕不至于常驻 */
const PARTIAL_MAX_MS = 10000;
/** pending 队列上限：识别积压时丢弃最旧，宁缺不堆积延迟 */
const MAX_PENDING = 4;

interface Caption {
  text: string;
  isFinal: boolean;
  /** 句锚点：句首条消息的音频流时间戳 */
  anchorTsMs: number;
  /** final 句尾的音频流时间戳 */
  endTsMs: number;
}

export function useSttTranscript(syncDelayMs: number, getCurrentTime: () => number) {
  const [currentText, setCurrentText] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);

  const syncDelayRef = useRef(syncDelayMs);
  const getCurrentTimeRef = useRef(getCurrentTime);

  // 对齐状态（ref：RAF 帧内直接读写，不触发重渲染）
  const epochRef = useRef(-1);
  const anchorRef = useRef<{ tsMs: number; playbackMs: number } | null>(null);
  const captionRef = useRef<Caption | null>(null);
  const pendingRef = useRef<Caption[]>([]);
  const rafRef = useRef<number | null>(null);
  const rafActiveRef = useRef(false);

  useEffect(() => {
    syncDelayRef.current = syncDelayMs;
  }, [syncDelayMs]);
  useEffect(() => {
    getCurrentTimeRef.current = getCurrentTime;
  }, [getCurrentTime]);

  // Start the RAF loop on demand (#12)
  const startRaf = useCallback(() => {
    if (rafActiveRef.current) return;
    rafActiveRef.current = true;

    const tick = () => {
      const delay = syncDelayRef.current;
      // 估算「正在播出的音频在流内的时间」：播放进度 + 锚点偏移（负偏移=提前）
      const anchor = anchorRef.current;
      const playbackMs = getCurrentTimeRef.current() * 1000;
      const eff =
        (anchor ? playbackMs + (anchor.tsMs - anchor.playbackMs) : playbackMs) - delay;

      // 过期清理：final 句尾播出并保留后清空；partial 断流兜底过期
      const caption = captionRef.current;
      if (caption) {
        if (caption.isFinal) {
          if (eff - caption.endTsMs > HOLD_MS + FADE_OUT_MS) {
            captionRef.current = null;
          }
        } else if (eff - caption.anchorTsMs > PARTIAL_MAX_MS) {
          captionRef.current = null;
        }
      }

      // pending 出队：句锚点到达（含 LEAD 提前量）即上屏
      const head = pendingRef.current[0];
      if (head && eff + LEAD_MS >= head.anchorTsMs) {
        pendingRef.current.shift();
        captionRef.current = head;
      }

      // 渲染状态同步
      const active = captionRef.current;
      if (active) {
        setCurrentText(active.text);
        setIsSpeaking(!active.isFinal || eff - active.endTsMs < HOLD_MS);
      } else if (caption) {
        // 刚过期的句：清空文本，由 SubtitleOverlay 的 CSS 过渡淡出
        setCurrentText("");
        setIsSpeaking(false);
      }

      // No captions left — stop RAF (#12)
      if (!captionRef.current && pendingRef.current.length === 0) {
        rafActiveRef.current = false;
        rafRef.current = null;
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const handleTranscript = useCallback(
    (payload: SttTranscript) => {
      if (payload.epoch !== epochRef.current) {
        // 新时间轴（tee 重连 / 管线重启）：清空全部状态，用首条重新锚定
        epochRef.current = payload.epoch;
        anchorRef.current = null;
        captionRef.current = null;
        pendingRef.current = [];
        setCurrentText("");
        setIsSpeaking(false);
      }
      if (!anchorRef.current) {
        anchorRef.current = {
          tsMs: payload.audioTsMs,
          playbackMs: getCurrentTimeRef.current() * 1000,
        };
      }

      // 句归属：pending 队尾或显示中句未 final → 同句更新；否则视为新句入队
      const tail = pendingRef.current[pendingRef.current.length - 1];
      const active = captionRef.current;
      const target =
        tail && !tail.isFinal
          ? tail
          : active && !active.isFinal
            ? active
            : null;
      if (target) {
        target.text = payload.text;
        if (payload.isFinal) {
          target.isFinal = true;
          target.endTsMs = payload.audioTsMs;
        }
      } else {
        pendingRef.current.push({
          text: payload.text,
          isFinal: payload.isFinal,
          anchorTsMs: payload.audioTsMs,
          endTsMs: payload.audioTsMs,
        });
        if (pendingRef.current.length > MAX_PENDING) pendingRef.current.shift();
      }

      startRaf();
    },
    [startRaf]
  );

  useTauriEvent<SttTranscript>("stt-transcript", handleTranscript);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return { currentText, isSpeaking };
}
