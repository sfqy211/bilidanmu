import type { DockSide } from "@/hooks/useWindowDock";

interface DockCollapsedBarProps {
  side: DockSide;
  onExpand: () => void;
}

/**
 * 侧边吸附的收缩态占位条：一条贴在屏幕边缘的细条。
 * 鼠标移入即展开（onExpand），不响应拖动（退出吸附在展开后拖离边缘触发，QQ 模式）。
 */
export function DockCollapsedBar({ side, onExpand }: DockCollapsedBarProps) {
  return (
    <div
      onMouseEnter={onExpand}
      className={`flex h-full w-full items-center justify-center bg-pink-500/80 transition-colors hover:bg-pink-500 ${
        side === "left" ? "rounded-r-md" : "rounded-l-md"
      }`}
      title="悬停展开"
    >
      {/* 中央短竖线作为视觉指示 */}
      <span className="block h-8 w-0.5 rounded-full bg-white/80" />
    </div>
  );
}
