import { tauriCommands } from "@/lib/tauri";

export type VideoViewMode = "list" | "cover";

const STORAGE_KEY = "videoViewMode";

/** 列表/封面视图偏好：模块级缓存，页面切走再回来（或首帧预载后）直接同步读取 */
let current: VideoViewMode = "list";

/** 首帧渲染前由 main.tsx 预载：只更新缓存，不重复落盘 */
export function initVideoViewMode(value: unknown): void {
  if (value === "list" || value === "cover") {
    current = value;
  }
}

export function getVideoViewMode(): VideoViewMode {
  return current;
}

/** 切换视图：更新缓存并持久化到 selections（与房间列表的 roomViewMode 同一存储） */
export function setVideoViewMode(mode: VideoViewMode): void {
  current = mode;
  void tauriCommands.selections.save({ [STORAGE_KEY]: mode }).catch(() => {});
}
