import { useEffect, useState } from "react";
import { tauriCommands } from "@/lib/tauri";

const BILI_CDN_PATTERN = /^https?:\/\/[a-z0-9]+\.hdslb\.com\//;
const CACHE_LIMIT = 200;

const cache = new Map<string, string>();

function cacheSet(key: string, value: string) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  cache.set(key, value);
}

function needsProxy(url: string): boolean {
  return BILI_CDN_PATTERN.test(url);
}

export function useProxyImage(url: string | undefined) {
  const [src, setSrc] = useState<string | undefined>(() => {
    if (!url) return undefined;
    return cache.get(url) ?? (needsProxy(url) ? undefined : url);
  });

  useEffect(() => {
    if (!url) {
      setSrc(undefined);
      return;
    }

    const cached = cache.get(url);
    if (cached) {
      setSrc(cached);
      return;
    }

    if (!needsProxy(url)) {
      setSrc(url);
      return;
    }

    let cancelled = false;

    tauriCommands.proxy
      .image(url)
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
