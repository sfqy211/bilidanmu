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
  className = "",
  labelClassName = "text-xs text-slate-500 dark:text-slate-400",
  valueClassName = "text-xs text-slate-500 dark:text-slate-400",
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
    <div className={`flex items-center gap-2 ${className}`}>
      <span className={`shrink-0 ${labelClassName}`}>{label}</span>
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
        className="h-1 min-w-0 flex-1 cursor-pointer accent-pink-500"
      />
      <span className={`w-9 shrink-0 text-right ${valueClassName}`}>{local}%</span>
    </div>
  );
}
