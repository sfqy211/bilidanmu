import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "danmaku-divider-ratio";
const DEFAULT_RATIO = 0.35;
const COLLAPSE_THRESHOLD = 0.05;

function loadRatio(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const val = Number(stored);
      if (val >= 0 && val <= 1) return val;
    }
  } catch { /* ignore */ }
  return DEFAULT_RATIO;
}

function saveRatio(ratio: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(ratio));
  } catch { /* ignore */ }
}

/**
 * Draggable vertical divider between two panels.
 * Returns the ratio (0~1) for the top panel; bottom panel gets `1 - ratio`.
 * Dragging to extremes (<0.05) collapses one side.
 */
export function useDividerDrag(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [ratio, setRatio] = useState(loadRatio);
  const draggingRef = useRef(false);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const newRatio = Math.max(0, Math.min(1, y / rect.height));

    setRatio(newRatio);
  }, [containerRef]);

  const handlePointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";

    // Read the latest ratio from state via a functional update
    setRatio((prev) => {
      const final = prev < COLLAPSE_THRESHOLD ? 0 : prev > 1 - COLLAPSE_THRESHOLD ? 1 : prev;
      saveRatio(final);
      return final;
    });
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      // #2: Reset body styles if component unmounts mid-drag
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      }
    };
  }, [handlePointerMove, handlePointerUp]);

  const onDividerPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
    // #5: Removed setPointerCapture — window-level listeners are sufficient
  }, []);

  const resetDivider = useCallback(() => {
    setRatio(DEFAULT_RATIO);
    saveRatio(DEFAULT_RATIO);
  }, []);

  return { ratio, setRatio, onDividerPointerDown, resetDivider };
}
