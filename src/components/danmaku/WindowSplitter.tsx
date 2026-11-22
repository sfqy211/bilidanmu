import { useTranslation as useDesktopTranslation } from "@/i18n";
import type { RefObject } from "react";

interface WindowSplitterProps {
  /** 当前上方面板占比 0~1 */
  ratio: number;
  onChange: (ratio: number) => void;
  /** 开始拖拽（可用于收起浮层） */
  onChangeStart?: () => void;
  /** 双击恢复的默认占比 */
  resetRatio?: number;
  /** 比例计算参考的容器；缺省取分隔条的父元素 */
  containerRef?: RefObject<HTMLElement | null>;
  disabled?: boolean;
  label?: string;
  className?: string;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/**
 * 上下两栏之间的拖拽分隔条（弹幕小窗内容区的通用原语）：
 * 指针拖拽改比例、双击复位、方向键/Home/End 微调。
 * 消费方自行决定 ratio 落在哪对面板上（直播三栏 / 视频两栏都可以复用）。
 */
export function WindowSplitter({
  ratio,
  onChange,
  onChangeStart,
  resetRatio = 0.5,
  containerRef,
  disabled = false,
  label,
  className = "",
}: WindowSplitterProps) {
  const { t: translate } = useDesktopTranslation("desktop");
  const ratioFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef?.current ?? event.currentTarget.parentElement;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const dividerHeight = event.currentTarget.getBoundingClientRect().height;
    const available = rect.height - dividerHeight;
    if (available <= 0) return null;
    return clamp((event.clientY - rect.top - dividerHeight / 2) / available);
  };

  return (
    <div
      className={`video-window-divider ${className}`}
      data-interactive
      role="separator"
      aria-label={label ?? translate("splitter.resize")}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={disabled ? -1 : 0}
      onDoubleClick={() => {
        if (disabled) return;
        onChange(resetRatio);
      }}
      onKeyDown={(event) => {
        const next: Record<string, number> = {
          ArrowUp: ratio - 0.05,
          ArrowDown: ratio + 0.05,
          Home: 0,
          End: 1,
        };
        const target = next[event.key];
        if (disabled || target === undefined) return;
        event.preventDefault();
        onChange(clamp(target));
      }}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        event.preventDefault();
        onChangeStart?.();
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const next = ratioFromPointer(event);
        if (next !== null) onChange(next);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    />
  );
}
