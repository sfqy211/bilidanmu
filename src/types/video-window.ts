export interface VideoDanmaku {
  id: string;
  progress: number;
  content: string;
}

/** 主窗口持有唯一音轨，视频弹幕窗只消费状态并发出控制请求。 */
export interface VideoPlaybackSnapshot {
  revision: number;
  bvid: string | null;
  aid: number | null;
  cid: number | null;
  title: string;
  tracks: { key: string; title: string; bvid: string }[];
  index: number;
  playing: boolean;
  loading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  error: string | null;
}

export type VideoPlaybackAction =
  | { action: "togglePlay" }
  | { action: "seek"; value: number }
  | { action: "volume"; value: number }
  | { action: "selectTrack"; value: string };

/**
 * 视频弹幕窗特有偏好。不透明度、弹幕字号、字幕字号是全局设置的共用项
 * （appearance.opacity / appearance.fontSize / listen.subtitleFontSize），不在此存储。
 */
export interface VideoWindowLocalPreferences {
  subtitleRatio: number;
  autoFollow: boolean;
  showTime: boolean;
}

export const DEFAULT_VIDEO_WINDOW_LOCAL: VideoWindowLocalPreferences = {
  subtitleRatio: 0.5,
  autoFollow: true,
  showTime: true,
};

/** 渲染层消费的完整偏好视图：共用项来自 settings store，特有项来自本地持久化 */
export type VideoWindowPreferences = {
  opacity: number;
  subtitleFontSize: number;
  danmakuFontSize: number;
} & VideoWindowLocalPreferences;
