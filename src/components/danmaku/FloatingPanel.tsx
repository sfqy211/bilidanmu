import type { ReactNode } from "react";
import { X } from "lucide-react";

interface FloatingPanelProps {
  title: string;
  onClose: () => void;
  className?: string;
  extra?: ReactNode;
  children: ReactNode;
}

export function FloatingPanel({ title, onClose, className, extra, children }: FloatingPanelProps) {
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      className={className}
    >
      <div className="danmaku-bg-panel">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200/50 dark:border-white/[0.06]">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</span>
          {extra ? (
            <div className="flex items-center gap-2">
              {extra}
              <button
                type="button"
                onClick={onClose}
                className="flex h-5 w-5 items-center justify-center rounded text-slate-400 transition hover:bg-[#ebebeb] dark:text-slate-500 dark:hover:bg-white/[0.06]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 transition hover:bg-[#ebebeb] dark:text-slate-500 dark:hover:bg-white/[0.06]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-3">
          {children}
        </div>
      </div>
    </div>
  );
}
