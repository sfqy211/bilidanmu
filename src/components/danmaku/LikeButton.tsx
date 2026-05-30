import { useEffect, useRef, useState } from "react";
import { ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { tauriCommands } from "@/lib/tauri";

interface LikeButtonProps {
  roomId: number | null;
  anchorId: number;
  disabled?: boolean;
}

export function LikeButton({ roomId, anchorId, disabled = false }: LikeButtonProps) {
  const [pressCount, setPressCount] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef(0);
  const sendingRef = useRef(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 卸载时清理所有定时器
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      if (fadeTimerRef.current !== null) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  const isDisabled = disabled || !roomId || !anchorId || anchorId <= 0;

  function handleMouseDown() {
    if (isDisabled || sendingRef.current) return;

    // 清除上次残留
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    if (fadeTimerRef.current !== null) clearTimeout(fadeTimerRef.current);
    setSentCount(0);

    countRef.current = 1;
    setPressCount(1);

    intervalRef.current = setInterval(() => {
      countRef.current = Math.min(countRef.current + 1, 100);
      setPressCount(countRef.current);
    }, 200);
  }

  function handleMouseUp() {
    if (isDisabled) return;

    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const clickCount = countRef.current;
    countRef.current = 0;

    if (clickCount === 0 || sendingRef.current) {
      setPressCount(0);
      return;
    }

    sendingRef.current = true;
    setSentCount(0);

    tauriCommands.danmaku
      .sendLike(roomId!, anchorId, clickCount)
      .then(() => {
        setPressCount(0);
        setSentCount(clickCount);
        fadeTimerRef.current = setTimeout(() => setSentCount(0), 1500);
      })
      .catch(() => {
        setPressCount(0);
        toast.error("点赞失败");
      })
      .finally(() => {
        sendingRef.current = false;
      });
  }

  function handleMouseLeave() {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    countRef.current = 0;
    setPressCount(0);
  }

  const showBadge = pressCount > 0 || sentCount > 0;

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        disabled={isDisabled}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        title={isDisabled ? (!roomId ? "请先选择直播间" : "缺少主播信息") : "长按点赞"}
        className={`flex h-10 w-10 items-center justify-center border transition ${
          isDisabled
            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300 opacity-60 dark:border-white/[0.04] dark:bg-[#0e1018] dark:text-slate-600"
            : pressCount > 0
              ? "border-pink-300 bg-pink-50 text-pink-500 dark:border-pink-500/30 dark:bg-pink-500/15"
              : "border-slate-300 bg-white text-slate-500 hover:bg-slate-100 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-slate-300 dark:hover:bg-white/[0.04]"
        }`}
      >
        <ThumbsUp className="h-4 w-4" />
      </button>

      {showBadge && (
        <span
          className={`pointer-events-none absolute -right-2 -top-2 z-10 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm ${
            pressCount > 0 ? "bg-pink-500" : "bg-emerald-500"
          }`}
        >
          {pressCount > 0 ? `×${pressCount}` : `✓${sentCount}`}
        </span>
      )}
    </div>
  );
}
