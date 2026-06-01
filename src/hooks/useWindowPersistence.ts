import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * 窗口尺寸持久化 hook。
 * 监听窗口 resize 事件，将宽高保存到 localStorage。
 * 打开窗口时从 localStorage 读取上次尺寸。
 */
export function useWindowPersistence(prefix: string) {
  useEffect(() => {
    const unlisten = getCurrentWindow().onResized(({ payload: size }) => {
      try {
        localStorage.setItem(`${prefix}-width`, String(size.width));
        localStorage.setItem(`${prefix}-height`, String(size.height));
      } catch { /* ignore */ }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [prefix]);
}

/**
 * 从 localStorage 读取上次保存的窗口尺寸。
 */
export function loadWindowSize(prefix: string): { width?: number; height?: number } {
  const w = Number(localStorage.getItem(`${prefix}-width`)) || undefined;
  const h = Number(localStorage.getItem(`${prefix}-height`)) || undefined;
  return { width: w, height: h };
}
