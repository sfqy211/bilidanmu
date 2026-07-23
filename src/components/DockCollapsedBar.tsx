import type { DockSide } from "@/hooks/useWindowDock";

interface DockCollapsedBarProps {
  side: DockSide;
  onExpand: () => void;
}

/**
 * 侧边吸附的收缩态占位条：贴在屏幕边缘的一条竖向深色玻璃卡片，中央一条短竖线作为可展开暗示。
 * 鼠标移入即展开（onExpand），不响应拖动（退出吸附在展开后拖离边缘触发，QQ 模式）。
 * 后端把窗体固定为小尺寸并垂直居中于原窗口，卡片铺满整个窗体作为悬停判定区。
 */
export function DockCollapsedBar({ side, onExpand }: DockCollapsedBarProps) {
  const isLeft = side === "left";
  return (
    <div
      onMouseEnter={onExpand}
      title="悬停展开"
      className={`flex h-full w-full items-center justify-center border-white/10 bg-slate-900/75 shadow-lg backdrop-blur-md transition-colors duration-200 hover:bg-slate-800/90 ${
        isLeft
          ? "rounded-r-lg border-y border-r"
          : "rounded-l-lg border-y border-l"
      }`}
    >
      {/* 中央一条短竖线作为"可展开"的视觉暗示 */}
      <span className="block h-8 w-0.5 rounded-full bg-white/30" />
    </div>
  );
}
