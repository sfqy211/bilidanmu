import { useCallback, useEffect, useRef, useState } from "react";
import { ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { tauriCommands } from "@/lib/tauri";

interface LikeButtonProps {
  roomId: number | null;
  anchorId: number;
  disabled?: boolean;
  totalLikeCount?: number;
}

export function LikeButton({
  roomId,
  anchorId,
  disabled = false,
  totalLikeCount = 0,
}: LikeButtonProps) {
  const [pressCount, setPressCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef(0);
  const lastSendTimeRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const disabledActually =
    disabled || !roomId || !anchorId || anchorId <= 0;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabledActually) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      countRef.current = 1;
      setPressCount(1);

      intervalRef.current = setInterval(() => {
        countRef.current = Math.min(countRef.current + 1, 100);
        if (mountedRef.current) {
          setPressCount(countRef.current);
        }
      }, 200);
    },
    [disabledActually],
  );

  const handlePointerUp = useCallback(
    async (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabledActually) return;
      e.preventDefault();
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);

      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      const clickCount = countRef.current;
      countRef.current = 0;
      setPressCount(0);

      const now = Date.now();
      if (now - lastSendTimeRef.current < 300) {
        toast.error("操作过快");
        return;
      }
      lastSendTimeRef.current = now;

      try {
        await tauriCommands.danmaku.sendLike(roomId!, anchorId, clickCount);
      } catch {
        if (mountedRef.current) {
          toast.error("点赞失败");
        }
      }
    },
    [disabledActually, roomId, anchorId],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabledActually) return;
      e.preventDefault();
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);

      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      countRef.current = 0;
      setPressCount(0);
    },
    [disabledActually],
  );

  const title = disabledActually && (!roomId || anchorId <= 0)
    ? !roomId
      ? "请先选择直播间"
      : "缺少主播信息，无法点赞"
    : "长按点赞";

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        disabled={disabledActually}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        title={title}
        className={`flex h-10 w-10 items-center justify-center border transition ${
          disabledActually
            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300 opacity-60 dark:border-white/[0.04] dark:bg-[#0e1018] dark:text-slate-600"
            : pressCount > 0
              ? "border-pink-300 bg-pink-50 text-pink-500 dark:border-pink-500/30 dark:bg-pink-500/15"
              : "border-slate-300 bg-white text-slate-500 hover:bg-slate-100 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-slate-300 dark:hover:bg-white/[0.04]"
        }`}
      >
        <ThumbsUp className="h-4 w-4" />
      </button>

      {/* Floating press-count badge */}
      {pressCount > 1 && (
        <span className="pointer-events-none absolute -right-2 -top-2 z-10 inline-flex items-center justify-center rounded-full bg-pink-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
          ×{pressCount}
        </span>
      )}

      {/* Total like count beside button */}
      {totalLikeCount > 0 && (
        <span className="ml-1 text-xs text-slate-400 dark:text-slate-500 select-none">
          {totalLikeCount >= 10000
            ? `${(totalLikeCount / 10000).toFixed(1)}万`
            : totalLikeCount >= 1000
              ? `${(totalLikeCount / 1000).toFixed(1)}k`
              : String(totalLikeCount)}
        </span>
      )}
    </div>
  );
}
