import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "确定",
  cancelText = "取消",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        ref={dialogRef}
        className="flex w-full max-w-sm flex-col items-center rounded-lg bg-[#f8f8f8] p-6 shadow-lg dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h3 className="mt-3 text-base font-medium text-slate-900 dark:text-white">{title}</h3>
        <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">{message}</p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="rounded px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.04]"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded px-4 py-2 text-sm font-medium text-white transition ${
              variant === "danger"
                ? "bg-red-500 hover:bg-red-400"
                : "bg-pink-500 hover:bg-pink-400"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
