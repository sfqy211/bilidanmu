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
  // 拖动节流：pointermove 可能远高于帧率，仅在 rAF 中应用最新比率，
  // 避免每个事件都触发整页重排（列表大时明显卡顿）
  const pendingRatioRef = useRef<number | null>(null);
  const rafRef = useRef(0);

  // 包装 setRatio，始终同步保存到 localStorage（拖动过程中不保存，松手时写终值）
  const setRatio = useCallback((value: number | ((prev: number) => number)) => {
    _setRatio((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      saveRatio(storageKeyRef.current, next);
      return next;
    });
  }, []);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      pendingRatioRef.current = Math.max(0, Math.min(1, y / rect.height));
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          if (!draggingRef.current) return;
          const pending = pendingRatioRef.current;
          if (pending != null) {
            _setRatio(pending);
          }
        });
      }
    },
    [containerRef],
  );

  const handlePointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    document.body.style.userSelect = "";
    document.body.style.cursor = "";

    _setRatio((prev) => {
      const pending = pendingRatioRef.current;
      pendingRatioRef.current = null;
      const base = pending ?? prev;
      const final = base < COLLAPSE_THRESHOLD ? 0 : base > 1 - COLLAPSE_THRESHOLD ? 1 : base;
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
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
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
