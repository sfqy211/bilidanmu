import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface CloseDialogProps {
  open: boolean;
  onHide: () => void;
  onExit: () => void;
  onCancel: () => void;
  /** 用户勾选"记住选择"后回调，传入最终行为 */
  onRemember?: (behavior: "hide" | "exit") => void;
}

export function CloseDialog({ open, onHide, onExit, onCancel, onRemember }: CloseDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRemember(false);
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

  const handleHide = () => {
    if (remember) onRemember?.("hide");
    onHide();
  };

  const handleExit = () => {
    if (remember) onRemember?.("exit");
    onExit();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        ref={dialogRef}
        className="flex w-full max-w-sm flex-col items-center rounded-lg bg-[#f8f8f8] p-6 shadow-lg dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-100 text-pink-500 dark:bg-pink-500/15 dark:text-pink-400">
          <X className="h-5 w-5" />
        </div>
        <h3 className="mt-3 text-base font-medium text-slate-900 dark:text-white">关闭窗口</h3>
        <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
          选择关闭主窗口后的行为
        </p>

        <div className="mt-5 flex w-full gap-3">
          <button
            onClick={handleHide}
            className="flex-1 rounded px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.04]"
          >
            隐藏到托盘
          </button>
          <button
            onClick={handleExit}
            className="flex-1 rounded bg-pink-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-pink-400"
          >
            退出程序
          </button>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <Checkbox
            checked={remember}
            onCheckedChange={(c) => setRemember(!!c)}
          />
          记住我的选择，下次不再询问
        </label>
      </div>
    </div>
  );
}
