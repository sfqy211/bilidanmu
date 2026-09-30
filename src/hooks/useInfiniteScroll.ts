import { useEffect, useRef } from "react";

/**
 * 无限滚动：把返回的 ref 挂到列表末尾的哨兵元素上，
 * 哨兵进入视口（含 rootMargin 提前量）时触发 onReachEnd 加载下一页。
 * enabled 为 false（如已加载完/加载中）时不触发；重新启用后自动恢复观察。
 */
export function useInfiniteScroll(
  onReachEnd: () => void,
  enabled: boolean,
  /** 内容变化时传入新的 key（如条目数）：追加条目后重挂观察器，
   *  否则一屏没填满时哨兵持续可见、不再触发交叉事件，自动加载会卡住 */
  rearmKey?: number | string
) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const callbackRef = useRef(onReachEnd);
  callbackRef.current = onReachEnd;

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !enabled) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callbackRef.current();
      },
      { rootMargin: "240px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, rearmKey]);

  return sentinelRef;
}
