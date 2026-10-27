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
 * 外观可在 设置 → 弹幕窗口 → 弹幕窗外观 中配置：
 * - style: glass 深色玻璃 / brand 品牌淡底 / line 极简细线
 * - size: slim / normal / wide（用内边距呈现粗细，不改后端窗口尺寸）
 * - indicator: 是否显示中央提示线
 */
export function DockCollapsedBar({ side, onExpand }: DockCollapsedBarProps) {
  const isTop = side === "top";
  const dockBar = useSettingsStore((s) => s.settings.appearance.danmakuWindow?.dockBar);
  const style = dockBar?.style ?? "glass";
  const size = dockBar?.size ?? "normal";
  const indicator = dockBar?.indicator ?? true;

  const styleClass =
    style === "brand"
      ? "border-brand/25 bg-brand/25 backdrop-blur-md hover:bg-brand/35"
      : style === "line"
        ? "border-transparent bg-transparent hover:bg-brand/10"
        : "border-white/10 bg-slate-900/75 shadow-lg backdrop-blur-md hover:bg-slate-800/90";

  const sizePadding = size === "slim" ? "p-0.5" : size === "wide" ? "p-2" : "p-1";
  const markLength = size === "slim" ? (isTop ? "w-5" : "h-5") : size === "wide" ? (isTop ? "w-12" : "h-12") : isTop ? "w-8" : "h-8";
  const markClass = style === "glass" ? "bg-white/30" : "bg-brand/70";

  return (
    <div
      onMouseEnter={onExpand}
      title="悬停展开"
      className={`flex h-full w-full items-center justify-center border transition-colors duration-200 ${styleClass} ${sizePadding} ${
        isTop
          ? "rounded-b-lg border-x border-b"
          : side === "left"
            ? "rounded-r-lg border-y border-r"
            : "rounded-l-lg border-y border-l"
      }`}
    >
      {indicator && (
        <span className={`block rounded-full ${markClass} ${isTop ? `h-0.5 ${markLength}` : `w-0.5 ${markLength}`}`} />
      )}
    </div>
  );
}
