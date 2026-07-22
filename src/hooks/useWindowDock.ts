import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { tauriCommands } from "@/lib/tauri";
import { useTauriEvent } from "@/hooks/useTauriEvent";

export type DockPhase = "normal" | "collapsed" | "expanded";
export type DockSide = "left" | "right";

interface DockChangedPayload {
  label: string;
  phase: DockPhase;
  side?: DockSide;
}

const appWindow = getCurrentWindow();

/**
 * 侧边吸附状态 hook：同步当前窗口的吸附 phase，并提供展开操作。
 * 展开由收缩条 mouseenter 触发；进入吸附（松手贴边）与展开收回（光标离开）
 * 均由后端光标轮询驱动，前端无需监听 mouseleave（无边框透明窗口上不可靠）。
 * 仅 main / danmaku-* 窗口会被后端判定吸附，其它窗口 phase 恒为 "normal"。
 */
export function useWindowDock() {
  const label = appWindow.label;
  const [phase, setPhase] = useState<DockPhase>("normal");
  const [side, setSide] = useState<DockSide>("left");

  // 启动时同步初始吸附状态
  useEffect(() => {
    let cancelled = false;
    void tauriCommands.dock
      .getState(label)
      .then((p) => {
        if (!cancelled && (p === "collapsed" || p === "expanded" || p === "normal")) {
          setPhase(p);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [label]);

  // 监听后端吸附状态变化（仅响应本窗口）
  useTauriEvent<DockChangedPayload>("dock-changed", (payload) => {
    if (payload.label !== label) return;
    setPhase(payload.phase);
    if (payload.side) setSide(payload.side);
  });

  /** 鼠标进入收缩条：展开 */
  const expand = () => {
    void tauriCommands.dock.expand(label).catch(() => {});
  };

  return { phase, side, expand };
}
