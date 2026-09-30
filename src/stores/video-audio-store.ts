import { create } from "zustand";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "./settings-store";
import type { SeasonInfo, VideoInfo } from "@/types/bilibili";

/**
 * 听视频模式的全局播放器：模块级 HTMLAudioElement 单例 + zustand 状态。
 *
 * 双层联播模型：
 * - 第一层（专辑联播）：PlayQueue 是当前专辑（收藏夹/合集/稍后再看/搜索结果/单个视频），
 *   一首曲目播完自动进入队列下一首；
 * - 第二层（分 P 联播）：单曲视频入队时把每个分 P 展开为独立曲目。
 *
 * audio 不挂 React 树，路由切换/关闭播放页后照常播放（后台播放）；
 * MiniPlayer 与播放器页都只读写本 store。
 */

/** 队列中的一首曲目：cid 为 null 表示播放时经 view 接口解析 */
export interface QueueTrack {
  bvid: string;
  cid: number | null;
  title: string;
  ownerName: string;
  cover?: string;
  duration: number;
}

export interface PlayQueue {
  /** 来源唯一键：fav-{id} / season-{id} / video-{bvid} / toview / search */
  key: string;
  title: string;
  tracks: QueueTrack[];
}

interface VideoAudioState {
  /** 当前曲目解析出的完整视频信息（字幕/分 P/合集切换都依赖它） */
  video: VideoInfo | null;
  queue: PlayQueue | null;
  /** 当前曲目在队列中的下标 */
  index: number;
  playing: boolean;
  loading: boolean;
  currentTime: number;
  duration: number;
  /** 0-100 */
  volume: number;
  error: string | null;
}

interface VideoAudioActions {
  playQueue: (queue: PlayQueue, index: number) => Promise<void>;
  /** 用单个视频建队（多分 P 展开为曲目），从指定分 P 开始播 */
  playVideo: (video: VideoInfo, pageIndex: number) => Promise<void>;
  playTrackAt: (index: number) => Promise<void>;
  /** 切换到另一张专辑，从当前曲目同名/同位置处尽量衔接 */
  switchQueue: (queue: PlayQueue) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  /** 关闭播放：停音频、清代理、清状态（MiniPlayer 的关闭按钮） */
  stop: () => void;
}

type VideoAudioStore = VideoAudioState & VideoAudioActions;

/** 由 VideoInfo 构建分 P 展开的队列 */
export function videoToQueue(video: VideoInfo): PlayQueue {
  return {
    key: `video-${video.bvid}`,
    title: video.title,
    tracks: video.pages.map((page) => ({
      bvid: video.bvid,
      cid: page.cid,
      title: video.pages.length > 1 ? `P${page.page} ${page.part}` : video.title,
      ownerName: video.ownerName,
      cover: video.cover,
      duration: page.duration,
    })),
  };
}

/** 由合集构建队列 */
export function seasonToQueue(season: SeasonInfo): PlayQueue {
  return {
    key: `season-${season.id}`,
    title: season.title,
    tracks: season.episodes.map((ep) => ({
      bvid: ep.bvid,
      cid: ep.cid,
      title: ep.title,
      ownerName: ep.ownerName,
      cover: ep.cover,
      duration: ep.duration,
    })),
  };
}

let audioEl: HTMLAudioElement | null = null;
/** 防止过期的异步加载覆盖新一轮选曲 */
let loadSeq = 0;

function ensureAudio(get: () => VideoAudioStore, set: (partial: Partial<VideoAudioStore>) => void) {
  if (audioEl) return audioEl;
  const el = new Audio();
  el.preload = "auto";
  el.addEventListener("play", () => set({ playing: true }));
  el.addEventListener("pause", () => set({ playing: false }));
  el.addEventListener("timeupdate", () => set({ currentTime: el.currentTime }));
  el.addEventListener("durationchange", () => set({ duration: Number.isFinite(el.duration) ? el.duration : 0 }));
  el.addEventListener("ended", () => {
    // 队列联播：当前曲目播完自动下一首，最后一首播完即停
    const { queue, index, next } = get();
    if (useSettingsStore.getState().settings.listen.autoNext && queue && index < queue.tracks.length - 1) {
      void next();
    } else {
      set({ playing: false });
    }
  });
  el.addEventListener("error", () => {
    if (el.src) set({ playing: false, loading: false, error: "音频加载失败，请重试" });
  });
  audioEl = el;
  return el;
}

export const useVideoAudioStore = create<VideoAudioStore>((set, get) => {
  const patch = (partial: Partial<VideoAudioStore>) => set(partial);

  const playTrackAt = async (queue: PlayQueue, index: number) => {
    const seq = ++loadSeq;
    const track = queue.tracks[index];
    if (!track) return;
    const audio = ensureAudio(get, patch);
    set({
      queue,
      index,
      loading: true,
      error: null,
      currentTime: 0,
      duration: track.duration,
      // 切到不同视频时清掉旧解析信息，播放器页据此重新加载
      video: get().video?.bvid === track.bvid ? get().video : null,
    });
    try {
      // 曲目无 cid（收藏夹/稍后再看/搜索整视频入队）时经 view 解析
      let video = get().video?.bvid === track.bvid ? get().video : null;
      let cid = track.cid;
      if (!video) {
        video = await tauriCommands.video.getInfo(track.bvid);
        if (seq !== loadSeq) return;
        set({ video });
      }
      if (cid == null) cid = video.pages[0]?.cid ?? 0;
      const stream = await tauriCommands.video.getAudio(track.bvid, cid);
      if (seq !== loadSeq) return;
      // 代理 URL 恒为 /vod-audio，追加递增参数强制浏览器重新拉流（否则切曲仍播旧音轨）
      audio.src = `${stream.url}?v=${seq}`;
      audio.load();
      audio.volume = get().volume / 100;
      await audio.play();
      if (seq !== loadSeq) return;
      set({ loading: false });
    } catch (e) {
      if (seq !== loadSeq) return;
      set({ loading: false, error: e instanceof Error ? e.message : "音频加载失败" });
    }
  };

  return {
    video: null,
    queue: null,
    index: 0,
    playing: false,
    loading: false,
    currentTime: 0,
    duration: 0,
    volume: useSettingsStore.getState().settings.listen.defaultVolume,
    error: null,

    playQueue: (queue, index) => playTrackAt(queue, index),

    playVideo: async (video, pageIndex) => {
      await playTrackAt(videoToQueue(video), pageIndex);
    },

    playTrackAt: (index) => {
      const { queue } = get();
      if (!queue) return Promise.resolve();
      return playTrackAt(queue, index);
    },

    switchQueue: async (queue) => {
      const { queue: oldQueue, index: oldIndex } = get();
      const current = oldQueue?.tracks[oldIndex];
      // 衔接当前曲目：优先 bvid+cid 双匹配（同一视频在合集里可能重复出现），
      // 其次首个 bvid 匹配，都找不到就从第一首开始
      let target = -1;
      if (current) {
        target = queue.tracks.findIndex(
          (t) => t.bvid === current.bvid && t.cid != null && current.cid != null && t.cid === current.cid
        );
        if (target < 0) target = queue.tracks.findIndex((t) => t.bvid === current.bvid);
      }
      await playTrackAt(queue, Math.max(target, 0));
    },

    togglePlay: async () => {
      const audio = ensureAudio(get, patch);
      if (!audio.src) return;
      if (audio.paused) {
        await audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    },

    next: async () => {
      const { queue, index, playTrackAt } = get();
      if (!queue || index >= queue.tracks.length - 1) return;
      await playTrackAt(index + 1);
    },

    prev: async () => {
      const { queue, index, playTrackAt } = get();
      if (!queue || index <= 0) return;
      await playTrackAt(index - 1);
    },

    seek: (seconds) => {
      const audio = ensureAudio(get, patch);
      if (!audio.src || !Number.isFinite(audio.duration)) return;
      audio.currentTime = Math.min(Math.max(seconds, 0), audio.duration);
      set({ currentTime: audio.currentTime });
    },

    setVolume: (volume) => {
      // 无播放时不创建 Audio 元素；创建音源时会从 store 带入该音量
      const clamped = Math.min(Math.max(Math.round(volume), 0), 100);
      set({ volume: clamped });
      if (audioEl) audioEl.volume = clamped / 100;
    },

    stop: () => {
      ++loadSeq;
      if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute("src");
      }
      void tauriCommands.video.stopAudio().catch(() => {});
      set({
        video: null,
        queue: null,
        index: 0,
        playing: false,
        loading: false,
        currentTime: 0,
        duration: 0,
        error: null,
      });
    },
  };
});

// 加载持久化设置或调整默认音量时同步；普通设置刷新不覆盖播放器的临时音量。
useSettingsStore.subscribe((state, previous) => {
  if (state.settings.listen.defaultVolume !== previous.settings.listen.defaultVolume) {
    useVideoAudioStore.getState().setVolume(state.settings.listen.defaultVolume);
  }
});
