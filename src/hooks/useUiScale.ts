import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "ui-scale";
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.0;
const STEP = 0.1;

function loadScale(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const val = Number(stored);
      if (val >= MIN_SCALE && val <= MAX_SCALE) return val;
    }
  } catch { /* ignore */ }
  return 1.0;
}

function saveScale(scale: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(scale));
  } catch { /* ignore */ }
}

/**
 * 全局 UI 缩放 hook。
 * Ctrl + - 缩小，Ctrl + = 放大，Ctrl + 0 重置。
 * 使用 CSS zoom 属性，对 WebView2 有效。
 */
export function useUiScale() {
  const [scale, setScale] = useState(loadScale);

  useEffect(() => {
    if (scale === 1) {
      document.documentElement.style.removeProperty("zoom");
    } else {
      document.documentElement.style.zoom = String(scale);
    }
  }, [scale]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;

      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setScale((prev) => {
          const next = Math.max(MIN_SCALE, prev - STEP);
          saveScale(next);
          return next;
        });
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setScale((prev) => {
          const next = Math.min(MAX_SCALE, prev + STEP);
          saveScale(next);
          return next;
        });
      } else if (e.key === "0") {
        e.preventDefault();
        setScale(1.0);
        saveScale(1.0);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
