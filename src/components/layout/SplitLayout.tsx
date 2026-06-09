import { useRef } from "react";
import { useDividerDrag } from "@/hooks/useDividerDrag";

interface SplitLayoutProps {
  /** 上栏内容 */
  top: React.ReactNode;
  /** 下栏内容 */
  bottom: React.ReactNode;
  /** 分割条存储 key */
  storageKey?: string;
  /** 默认分割比例（0~1，上栏占比） */
  defaultRatio?: number;
  /** 容器 className */
  className?: string;
}

/**
 * 双栏分割布局，支持拖拽调整比例。
 * - 拖拽持久化到 localStorage
 * - 双击重置为默认比例
 * - 键盘无障碍（方向键微调）
 * - 折叠时保留分割条以便恢复
 */
export function SplitLayout({
  top,
  bottom,
  storageKey = "split-divider-ratio",
  defaultRatio = 0.5,
  className,
}: SplitLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { ratio, setRatio, onDividerPointerDown, resetDivider } = useDividerDrag(containerRef, {
    storageKey,
    defaultRatio,
  });

  const showTop = ratio > 0.02;
  const showBottom = ratio < 0.98;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setRatio((prev) => Math.max(0, prev - step));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setRatio((prev) => Math.min(1, prev + step));
    }
  };

  return (
    <div ref={containerRef} className={className}>
      {/* 上栏 — 始终渲染，折叠时 flex=0 但分割条仍可拖拽恢复 */}
      <div className="flex min-h-0 flex-col overflow-hidden" style={{ flex: ratio }}>
        {showTop && top}
      </div>

      {/* 分割条 */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onPointerDown={onDividerPointerDown}
        onDoubleClick={() => resetDivider()}
        onKeyDown={handleKeyDown}
        className="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-slate-300/40 transition hover:bg-pink-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-500 dark:bg-white/[0.08] dark:hover:bg-pink-500/40"
      >
        <div className="h-px w-8 rounded-full bg-slate-400/60 dark:bg-white/20" />
      </div>

      {/* 下栏 — 始终渲染，折叠时 flex=0 但分割条仍可拖拽恢复 */}
      <div className="flex min-h-0 flex-col overflow-hidden" style={{ flex: 1 - ratio }}>
        {showBottom && bottom}
      </div>
    </div>
  );
}
