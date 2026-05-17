import { useCallback, useEffect, useRef, useState } from "react";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import type { SttTranscript } from "@/types/bilibili";

interface SubtitleEntry {
  text: string;
  timestamp: number;
  isFinal: boolean;
}

const DISPLAY_DURATION_MS = 5000;
const FADE_OUT_MS = 800;

export function useSttTranscript(syncDelayMs: number) {
  const [currentText, setCurrentText] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const bufferRef = useRef<SubtitleEntry[]>([]);
  const rafRef = useRef<number | null>(null);
  const syncDelayRef = useRef(syncDelayMs);

  useEffect(() => {
    syncDelayRef.current = syncDelayMs;
  }, [syncDelayMs]);

  const handleTranscript = useCallback((payload: SttTranscript) => {
    bufferRef.current.push({
      text: payload.text,
      timestamp: performance.now(),
      isFinal: payload.isFinal,
    });

    // Keep buffer bounded
    if (bufferRef.current.length > 50) {
      bufferRef.current = bufferRef.current.slice(-20);
    }
  }, []);

  useTauriEvent<SttTranscript>("stt-transcript", handleTranscript);

  useEffect(() => {
    const tick = () => {
      const now = performance.now();
      const delay = syncDelayRef.current;
      const buffer = bufferRef.current;

      // Find the most recent entry whose delayed time has arrived
      let best: SubtitleEntry | null = null;
      for (let i = buffer.length - 1; i >= 0; i--) {
        const entry = buffer[i];
        const delayedTime = entry.timestamp + delay;
        if (delayedTime <= now) {
          best = entry;
          break;
        }
      }

      if (best) {
        const age = now - best.timestamp - delay;
        const expired = age > DISPLAY_DURATION_MS;

        if (expired) {
          setCurrentText("");
          setIsSpeaking(false);
          // Clean up old entries
          bufferRef.current = bufferRef.current.filter(
            (e) => e.timestamp > now - DISPLAY_DURATION_MS - Math.abs(delay) - 1000
          );
        } else {
          setCurrentText(best.text);
          setIsSpeaking(!best.isFinal || age < FADE_OUT_MS);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return { currentText, isSpeaking };
}
