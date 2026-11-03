import type { DockSide } from "@/hooks/useWindowDock";
import { useSettingsStore } from "@/stores/settings-store";

interface DockCollapsedBarProps {
  side: DockSide;
  onExpand: () => void;
}

/**
 * 侧边吸附的收缩态占位条：贴在屏幕边缘的一条卡片，中央（可选）一条短线作为可展开暗示。
 * 左右吸附为竖向条（圆角朝屏内），顶部吸附为横向条（圆角朝下）；鼠标移入即展开（onExpand），
 * 不响应拖动（退出吸附在展开后拖离边缘触发，QQ 模式）。
 * 后端把窗体固定为小尺寸并居中于原窗口位置，卡片铺满整个窗体作为悬停判定区。
 *
 * 两个开关（设置 → 弹幕窗口 → 弹幕窗外观）：
 * - dockEnabled：收起条开关。关闭后不绘制任何可见内容（对齐 QQ：收起后整条完全看不见），
 *   但窗口本身保持原尺寸与鼠标命中区，鼠标移到该位置仍能触发展开——不可见 ≠ 不可点。
 *   弹幕窗是 transparent 窗口，不画东西即完全透明。
 * - dockIndicator：可见时中央是否画提示线。
 *
 * 配色走 .danmaku-dock-bar（index.css），跟随亮/暗主题，不写死深色。
 * 整体粗细由 Rust 侧 DOCK_WIDTH / COLLAPSED_LENGTH 决定。
 */
export function DockCollapsedBar({ side, onExpand }: DockCollapsedBarProps) {
  const isTop = side === "top";
  const dockBar = useSettingsStore((s) => s.settings.appearance.danmakuWindow);
  const enabled = dockBar?.dockEnabled ?? true;
  const indicator = dockBar?.dockIndicator ?? true;

  // 关闭收起条：只留一个铺满的透明悬停区，命中判定照常工作
  if (!enabled) {
    return <div onMouseEnter={onExpand} className="h-full w-full" aria-hidden="true" />;
  }

  return (
    <div
      onMouseEnter={onExpand}
      title="悬停展开"
      className={`danmaku-dock-bar flex h-full w-full items-center justify-center p-0.5 ${
        isTop
          ? "rounded-b-md"
          : side === "left"
            ? "rounded-r-md"
            : "rounded-l-md"
      }`}
    >
      {indicator && (
        <span className={`danmaku-dock-bar-mark block rounded-full ${isTop ? "h-0.5 w-6" : "w-0.5 h-6"}`} />
      )}
    </div>
  );
}
