import { useEffect, useState } from "react";

interface OpacitySliderProps {
  value: number;
  onChange: (val: number) => void;
  /** 左侧标签文字 */
  label?: string;
  /** 外层容器 class */
  className?: string;
  /** 标签文字 class */
  labelClassName?: string;
  /** 数值文字 class */
  valueClassName?: string;
}

export function OpacitySlider({
  value,
  onChange,
  label = "背景透明度",
  className = "bg-[#f0f0f0] px-4 py-3 dark:bg-[#0e1018]",
  labelClassName = "text-sm text-slate-600 dark:text-slate-300",
  valueClassName = "text-xs text-slate-400 dark:text-slate-500",
}: OpacitySliderProps) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const commit = (next: number) => {
    const val = Math.max(10, Math.min(100, next));
    setLocal(val);
    if (val !== value) {
      onChange(val);
    }
  };

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between">
        <span className={labelClassName}>{label}</span>
        <span className={valueClassName}>{local}%</span>
      </div>
      <input
        type="range"
        min={10}
        max={100}
        value={local}
        onChange={(e) => {
          const val = Math.max(10, Number((e.target as HTMLInputElement).value));
          setLocal(val);
        }}
        onPointerUp={(e) => commit(Number((e.currentTarget as HTMLInputElement).value))}
        onKeyUp={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
            commit(Number((e.currentTarget as HTMLInputElement).value));
          }
        }}
        onBlur={(e) => commit(Number((e.currentTarget as HTMLInputElement).value))}
        className="h-1 w-full cursor-pointer accent-pink-500"
      />
    </div>
  );
}
