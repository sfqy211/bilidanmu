import { useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { deskModes, type DeskMode } from "../data";
import { createAsset } from "../links";

const sheetCols = ["A", "B", "C", "D", "E", "F"];
const sheetRows = [1, 2, 3, 4, 5, 6];

function cellClass(row: number, col: number) {
  return {
    "is-filled": (row * 3 + col) % 5 === 0,
    "is-accent": row === 2 && col === 4,
    "is-selected": row === 3 && col === 5,
  };
}

export function DeskDemo({ assetBase, dark = false }: { assetBase: string; dark?: boolean }) {
  const asset = createAsset(assetBase);
  const [mode, setMode] = useState<DeskMode>("opacity");
  const [opacity, setOpacity] = useState(44);
  const [dockOpen, setDockOpen] = useState(true);
  const [passThrough, setPassThrough] = useState(true);

  const activeHint = deskModes.find((item) => item.key === mode)?.hint ?? "";

  function selectMode(key: DeskMode) {
    setMode(key);
    if (key === "dock") setDockOpen(true);
  }

  function leaveWindow(event: PointerEvent<HTMLDivElement>) {
    if (mode !== "dock" || event.pointerType !== "mouse") return;
    const next = event.relatedTarget;
    if (next instanceof Element && next.closest(".desk-edge")) return;
    setDockOpen(false);
  }

  const stageClass = [
    "desk-stage",
    mode === "dock" && !dockOpen ? "is-docked" : "",
    mode === "pass" && passThrough ? "pass-on" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`desk-demo${dark ? " dark" : ""}`}>
      <div className="desk-modes" role="group" aria-label="选择桌面窗口演示模式">
        {deskModes.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={mode === item.key}
            onClick={() => selectMode(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className={stageClass} data-mode={mode}>
        <div className="desk-backdrop" aria-hidden="true">
          <span className="desk-note">工作区 / 演示背景</span>
          <div className="desk-sheet">
            <div className="desk-sheet-bar">
              <span className="desk-sheet-dots">
                <i />
                <i />
                <i />
              </span>
              <span className="desk-sheet-title">工作区</span>
              <span className="desk-sheet-tools">
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className="desk-sheet-toolbar">
              <span>文件</span>
              <span>开始</span>
              <span>插入</span>
              <span>公式</span>
              <span className="desk-sheet-toolbar-end">筛选</span>
            </div>
            <div className="desk-sheet-grid">
              <span className="desk-sheet-colhead" />
              {sheetCols.map((col) => (
                <span key={col} className="desk-sheet-colhead">
                  {col}
                </span>
              ))}
              {sheetRows.map((row) => (
                <RowCells key={row} row={row} />
              ))}
            </div>
            <span className="desk-sheet-status">工作表 1</span>
          </div>
        </div>

        <div
          className="desk-window"
          style={
            mode === "opacity"
              ? ({ "--desk-bg": String(opacity / 100) } as CSSProperties)
              : undefined
          }
          onPointerLeave={leaveWindow}
        >
          <div className="desk-window-bg" />
          <img
            src={asset("danmaku-content.webp")}
            width={1040}
            height={1520}
            alt="BiliDanmu 弹幕窗口界面，显示直播消息和发送栏"
          />
          {mode === "pass" ? (
            <div className="desk-pass-layer" aria-hidden="true">
              <span className="desk-pass-zone desk-pass-zone-top">顶栏与输入框：可交互</span>
              <span className="desk-pass-zone desk-pass-zone-body">空白处：点击穿透</span>
            </div>
          ) : null}
        </div>

        {mode === "dock" ? (
          <button
            className="desk-edge"
            type="button"
            aria-expanded={dockOpen}
            aria-label="展开弹幕窗口"
            onPointerEnter={() => setDockOpen(true)}
            onClick={() => setDockOpen(true)}
          >
            <span className="desk-edge-grip" aria-hidden="true" />
            <span className="desk-edge-label" aria-hidden="true">
              弹幕
            </span>
          </button>
        ) : null}

        {mode === "dock" && !dockOpen ? (
          <span className="desk-dock-hint">靠近右侧边条展开</span>
        ) : null}
      </div>

      <div className="desk-controls">
        {mode === "opacity" ? (
          <>
            <label className="desk-control-label">窗口背景不透明度</label>
            <Slider
              value={[opacity]}
              min={10}
              max={100}
              step={1}
              onValueChange={(values) => setOpacity(values[0] ?? 10)}
              className="desk-slider"
              aria-label="窗口背景不透明度"
            />
            <output>{opacity}%</output>
          </>
        ) : null}

        {mode === "dock" ? (
          <>
            <p className="desk-control-copy">
              {dockOpen ? "鼠标移开，窗口收成一条边。" : "已收起。把鼠标移到右侧边条。"}
            </p>
            <button
              type="button"
              className="desk-control-action"
              onClick={() => setDockOpen((open) => !open)}
            >
              {dockOpen ? "收起窗口" : "展开窗口"}
            </button>
          </>
        ) : null}

        {mode === "pass" ? (
          <>
            <p className="desk-control-copy">
              {passThrough
                ? "空白处已可穿透，按钮和输入框仍可操作。"
                : "穿透已关闭，所有点击都由弹幕窗接收。"}
            </p>
            <button
              type="button"
              className="desk-control-action"
              aria-pressed={passThrough}
              onClick={() => setPassThrough((value) => !value)}
            >
              {passThrough ? "关闭穿透" : "开启穿透"}
            </button>
          </>
        ) : null}
      </div>

      <p className="desk-caption">{activeHint}</p>
    </div>
  );
}

function RowCells({ row }: { row: number }) {
  return (
    <>
      <span className="desk-sheet-rowhead">{row}</span>
      {sheetCols.map((col, index) => (
        <i key={`${row}-${col}`} className={cn(cellClass(row, index + 1))} />
      ))}
    </>
  );
}
