import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type MessageType = "error" | "success" | "info" | "warning";

interface InlineMessageProps {
  type: MessageType;
  children: React.ReactNode;
  className?: string;
  /** 自动消失毫秒数，默认 2000，传 0 禁用 */
  dismissMs?: number;
}

const typeStyles: Record<MessageType, string> = {
  error:
    "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  info: "border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400",
  warning:
    "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
};

export function InlineMessage({
  type,
  children,
  className,
  dismissMs = 2000,
}: InlineMessageProps) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  const dismiss = useCallback(() => {
    setFading(true);
    setTimeout(() => setVisible(false), 200);
  }, []);

  useEffect(() => {
    if (dismissMs <= 0 || !visible) return;
    const timer = setTimeout(dismiss, dismissMs);
    return () => clearTimeout(timer);
  }, [dismissMs, dismiss, visible]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "border px-3 py-1.5 text-sm transition-opacity duration-200",
        typeStyles[type],
        fading && "opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
