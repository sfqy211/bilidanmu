import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { TitleBar } from "./TitleBar";
import { MiniPlayer } from "@/components/listen/MiniPlayer";
import { rememberRoute } from "@/lib/app-history";
import { tauriCommands } from "@/lib/tauri";
import { clampSidebarWidth, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN, useUiStore } from "@/stores/ui-store";

export function WorkspaceLayout({ sidebar, notice }: { sidebar: ReactNode; notice?: ReactNode }) {
  const location = useLocation();
  const isVideoRoute = location.pathname.startsWith("/listen/video/");
  useEffect(() => {
    if (!isVideoRoute) rememberRoute(location.pathname);
  }, [isVideoRoute, location.pathname]);

  // 侧边栏拖宽：手柄用指针事件 + setPointerCapture（移出手柄范围也持续收到移动），
  // 宽度实时写入 ui-store（inline 覆盖 CSS 默认值），松手/键盘调整后持久化到 selections。
  const setSidebarWidth = useUiStore((state) => state.setSidebarWidth);
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const handleRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // 起始宽度：优先取已保存值；未自定义时从侧栏 DOM 读当前渲染宽度（CSS 默认随字号伸缩）
  const currentWidth = () => {
    const saved = useUiStore.getState().sidebarWidth;
    if (saved != null) return saved;
    const aside = handleRef.current?.previousElementSibling as HTMLElement | null;
    return aside?.offsetWidth ?? 120;
  };

  const persistWidth = (width: number | null) => {
    void tauriCommands.selections.save({ sidebarWidth: width });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { startX: event.clientX, startWidth: currentWidth() };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state) return;
    setSidebarWidth(clampSidebarWidth(state.startWidth + event.clientX - state.startX));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    persistWidth(useUiStore.getState().sidebarWidth);
  };

  // 双击恢复默认宽度（跟随界面字号伸缩）
  const handleDoubleClick = () => {
    setSidebarWidth(null);
    persistWidth(null);
  };

  // 键盘微调：左右方向键 ±8px
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -8 : 8;
    const next = clampSidebarWidth(currentWidth() + delta);
    setSidebarWidth(next);
    persistWidth(next);
  };

  // 拖动期间锁定光标与文本选择（指针快速移动离开手柄时保持体验一致）
  useEffect(() => {
    if (!dragging) return;
    const { body } = document;
    const previousCursor = body.style.cursor;
    const previousUserSelect = body.style.userSelect;
    body.style.cursor = "col-resize";
    body.style.userSelect = "none";
    return () => {
      body.style.cursor = previousCursor;
      body.style.userSelect = previousUserSelect;
    };
  }, [dragging]);

  return (
    <div
      className="window-rounded app-atmosphere app-scope workspace-shell flex h-full flex-col overflow-hidden text-ink"
      style={sidebarWidth != null ? ({ "--workspace-sidebar-width": `${sidebarWidth}px` } as CSSProperties) : undefined}
    >
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        {sidebar}
        <div
          ref={handleRef}
          className="workspace-sidebar-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整侧边栏宽度"
          aria-valuemin={SIDEBAR_WIDTH_MIN}
          aria-valuemax={SIDEBAR_WIDTH_MAX}
          aria-valuenow={sidebarWidth ?? undefined}
          tabIndex={0}
          title="拖动调整侧边栏宽度，双击恢复默认"
          data-dragging={dragging || undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          onKeyDown={handleKeyDown}
        />
        <main className="workspace-main flex min-h-0 min-w-0 flex-1 flex-col">
          {notice}
          <div className="workspace-page min-h-0 flex-1 overflow-auto"><Outlet /></div>
          <MiniPlayer />
        </main>
      </div>
    </div>
  );
}
