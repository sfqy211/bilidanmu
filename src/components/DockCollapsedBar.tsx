import type { DockSide } from "@/hooks/useWindowDock";

interface DockCollapsedBarProps {
  side: DockSide;
  onExpand: () => void;
}

/**
 * 侧边吸附的收缩态占位条：贴在屏幕边缘的一条深色玻璃卡片，中央一条短线作为可展开暗示。
 * 左右吸附为竖向条（圆角朝屏内），顶部吸附为横向条（圆角朝下）；鼠标移入即展开（onExpand），
 * 不响应拖动（退出吸附在展开后拖离边缘触发，QQ 模式）。
 * 后端把窗体固定为小尺寸并居中于原窗口位置，卡片铺满整个窗体作为悬停判定区。
 */
export function DockCollapsedBar({ side, onExpand }: DockCollapsedBarProps) {
  const isTop = side === "top";
  return (
    <div
      onMouseEnter={onExpand}
      title="悬停展开"
      className={`flex h-full w-full items-center justify-center border-white/10 bg-slate-900/75 shadow-lg backdrop-blur-md transition-colors duration-200 hover:bg-slate-800/90 ${
        isTop
          ? "rounded-b-lg border-x border-b"
          : side === "left"
            ? "rounded-r-lg border-y border-r"
            : "rounded-l-lg border-y border-l"
      }`}
    >
      {/* 中央一条短线作为"可展开"的视觉暗示：左右条为竖线，顶条为横线 */}
      <span className={`block rounded-full bg-white/30 ${isTop ? "h-0.5 w-8" : "h-8 w-0.5"}`} />
    </div>
  );
}
