import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_RATIO = 0.5;
const COLLAPSE_THRESHOLD = 0.05;

function loadRatio(storageKey: string, fallback: number): number {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const val = Number(stored);
      if (val >= 0 && val <= 1) return val;
    }
  } catch { /* ignore */ }
  return fallback;
}

function saveRatio(storageKey: string, ratio: number): void {
  try {
    localStorage.setItem(storageKey, String(ratio));
  } catch { /* ignore */ }
}

/**
 * Draggable vertical divider between two panels.
 * Returns the ratio (0~1) for the top panel; bottom panel gets `1 - ratio`.
 * Dragging to extremes (<0.05) collapses one side.
 */
export function useDividerDrag(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options?: { storageKey?: string; defaultRatio?: number }
) {
  const storageKey = options?.storageKey ?? "danmaku-divider-ratio";
  const fallback = options?.defaultRatio ?? DEFAULT_RATIO;

  const [ratio, _setRatio] = useState(() => loadRatio(storageKey, fallback));
  const draggingRef = useRef(false);
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  // 包装 setRatio，始终同步保存到 localStorage
  const setRatio = useCallback((value: number | ((prev: number) => number)) => {
    _setRatio((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      saveRatio(storageKeyRef.current, next);
      return next;
    });
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const newRatio = Math.max(0, Math.min(1, y / rect.height));

    setRatio(newRatio);
  }, [containerRef, setRatio]);

  const handlePointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";

    _setRatio((prev) => {
      const final = prev < COLLAPSE_THRESHOLD ? 0 : prev > 1 - COLLAPSE_THRESHOLD ? 1 : prev;
      saveRatio(storageKeyRef.current, final);
      return final;
    });
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
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
  }, []);

  const resetDivider = useCallback(() => {
    setRatio(fallback);
  }, [setRatio, fallback]);

  return { ratio, setRatio, onDividerPointerDown, resetDivider };
}
