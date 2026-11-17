import { create } from "zustand";

/** 侧边栏宽度可调范围（px）：下限以下标签挤成竖排，上限再宽就浪费内容区 */
export const SIDEBAR_WIDTH_MIN = 88;
export const SIDEBAR_WIDTH_MAX = 224;
/** 收起态宽度：只留一列图标 */
export const SIDEBAR_COLLAPSED_WIDTH = 56;

export const clampSidebarWidth = (width: number) =>
  Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)));

interface UiState {
  /** 侧边栏宽度（px）；null = 跟随 CSS 默认（随界面字号伸缩） */
  sidebarWidth: number | null;
  setSidebarWidth: (width: number | null) => void;
  /** 收起为纯图标栏（点击品牌图标切换） */
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

/** 界面外壳级 UI 状态（selections 持久化，与账号无关） */
export const useUiStore = create<UiState>((set) => ({
  sidebarWidth: null,
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
  sidebarCollapsed: false,
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
}));
