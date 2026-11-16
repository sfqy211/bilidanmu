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

export interface VideoWindowPreferences {
  opacity: number;
  subtitleFontSize: number;
  danmakuFontSize: number;
  autoFollow: boolean;
  showTime: boolean;
  subtitleRatio: number;
}

export const DEFAULT_VIDEO_WINDOW_PREFERENCES: VideoWindowPreferences = {
  opacity: 90,
  subtitleFontSize: 15,
  danmakuFontSize: 14,
  autoFollow: true,
  showTime: true,
  subtitleRatio: 0.5,
};
