import { useEffect, useRef, useState } from "react";
import { tauriCommands } from "@/lib/tauri";

const BILI_CDN_PATTERN = /^https?:\/\/[a-z0-9]+\.hdslb\.com\//;
const CACHE_LIMIT = 500;

// L1 内存缓存，避免同一 URL 重复走 IPC
const memoryCache = new Map<string, string>();

function cacheSet(key: string, value: string) {
  if (memoryCache.size >= CACHE_LIMIT) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) {
      memoryCache.delete(oldest);
    }
  }
  memoryCache.set(key, value);
}

function needsProxy(url: string): boolean {
  return BILI_CDN_PATTERN.test(url);
}

/**
 * @param persistent true = L1 内存 + L2 SQLite 持久化（封面/头像/表情包图片）
 *                   false = 仅 L1 内存（弹幕表情/醒目留言头像等临时图片）
 */
export function useProxyImage(url: string | undefined, persistent = false) {
  const persistentRef = useRef(persistent);
  persistentRef.current = persistent;

  const [src, setSrc] = useState<string | undefined>(() => {
    if (!url) return undefined;
    return memoryCache.get(url) ?? (needsProxy(url) ? undefined : url);
  });

  useEffect(() => {
    if (!url) {
      setSrc(undefined);
      return;
    }

    // L1 命中
    const memHit = memoryCache.get(url);
    if (memHit) {
      setSrc(memHit);
      return;
    }

    if (!needsProxy(url)) {
      setSrc(url);
      return;
    }

    let cancelled = false;

    tauriCommands.proxy
      .image(url, persistentRef.current)
      .then((dataUrl) => {
        if (!cancelled) {
          cacheSet(url, dataUrl);
          setSrc(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(url);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return src;
}
