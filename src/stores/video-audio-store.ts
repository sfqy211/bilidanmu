import { create } from "zustand";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "./settings-store";
import type { SeasonInfo, VideoInfo } from "@/types/bilibili";

/**
 * 全局音量联动：听视频与直播间共用 settings.audio.defaultVolume，
 * 调节后防抖写回设置（跨窗口广播 + 持久化）。写回前同值短路，
 * 使联动回声（广播回来再次触发 setVolume）不会成环。
 */
let volumeSyncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleGlobalVolumeSync(volume100: number) {
  if (volumeSyncTimer) clearTimeout(volumeSyncTimer);
  volumeSyncTimer = setTimeout(() => {
    volumeSyncTimer = null;
    const { settings, patchSettings, saveSettings } = useSettingsStore.getState();
    if (settings.audio.defaultVolume === volume100) return;
    patchSettings({ audio: { ...settings.audio, defaultVolume: volume100 } });
    void saveSettings();
  }, 400);
}

/**
 * 听视频模式的全局播放器：模块级 HTMLAudioElement 单例 + zustand 状态。
 *
 * 双层联播模型：
 * - 第一层（专辑联播）：PlayQueue 是当前专辑（收藏夹/合集/稍后再看/搜索结果/单个视频），
 *   一首曲目播完按播放模式（顺序/随机/单曲循环/列表循环）前进；
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
  /**
   * tracks 是否已按分 P 展开（videoToQueue / seasonToQueue 为 true）。
   * 为 true 时每个曲目自带 cid、各自是一"首"；为 false 时一首曲目代表整个视频，
   * 具体播哪一 P 由 pageIndex 决定。注意不能用 track.cid 是否为空来判断这件事：
   * 稍后再看的条目本身就带着 cid（记录上次看到哪一 P）。
   */
  perPage?: boolean;
}

/**
 * 播放模式：
 * - order：顺序播放，播到队尾停止
 * - shuffle：随机播放，按洗牌序列走完一遍后停止
 * - repeat-one：单曲循环，播完重播当前曲目
 * - repeat-all：列表循环，播到队尾回到第一首
 */
export type PlayMode = "order" | "shuffle" | "repeat-one" | "repeat-all";

/** 模式循环切换顺序（点一次按钮切下一个） */
export const PLAY_MODE_ORDER: PlayMode[] = ["order", "shuffle", "repeat-one", "repeat-all"];

export const PLAY_MODE_LABEL: Record<PlayMode, string> = {
  order: "顺序播放",
  shuffle: "随机播放",
  "repeat-one": "单曲循环",
  "repeat-all": "列表循环",
};

interface VideoAudioState {
  /** 当前曲目解析出的完整视频信息（字幕/分 P/合集切换都依赖它） */
  video: VideoInfo | null;
  queue: PlayQueue | null;
  /** 当前曲目在队列中的下标 */
  index: number;
  /**
   * 当前曲目内部的第几个分 P（0 基）。
   * 队列里一首"列表视频"代表整个视频（track.cid 为 null），从某个分 P 进入时
   * 由它决定实际播放哪一 P；分 P 之间始终顺序连播，不受播放模式影响。
   */
  pageIndex: number;
  playing: boolean;
  loading: boolean;
  currentTime: number;
  duration: number;
  /** 0-100 */
  volume: number;
  error: string | null;
  /** 播放模式（会话级，不落盘） */
  playMode: PlayMode;
  /**
   * 随机播放的曲目下标序列。切队列时按当前曲目重新洗牌（当前曲目排在首位），
   * 只在 shuffle 模式下参与 next/prev 计算；不改动 queue.tracks 原始顺序，
   * 保证 switchQueue 的 bvid+cid 衔接与列表展示顺序都不受影响。
   */
  playOrder: number[];
}

interface VideoAudioActions {
  playQueue: (queue: PlayQueue, index: number) => Promise<void>;
  /** 用单个视频建队（多分 P 展开为曲目），从指定分 P 开始播 */
  playVideo: (video: VideoInfo, pageIndex: number) => Promise<void>;
  playTrackAt: (index: number) => Promise<void>;
  /** 在当前曲目内切到指定分 P（分 P 连播用，不改变队列位置） */
  playPage: (pageIndex: number) => Promise<void>;
  /** 切换到另一张专辑，从当前曲目同名/同位置处尽量衔接 */
  switchQueue: (queue: PlayQueue) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  /** 手动切下一首/上一首时无歌可切（如单曲循环且队列仅一首）返回 false */
  canNext: () => boolean;
  canPrev: () => boolean;
  setPlayMode: (mode: PlayMode) => void;
  /** 按 PLAY_MODE_ORDER 循环切到下一个模式 */
  cyclePlayMode: () => void;
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
    perPage: true,
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
    perPage: true,
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

/** Fisher-Yates 洗牌，返回新数组（不改入参） */
function shuffleIndices(length: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

/**
 * 为随机播放生成序列：把 startIndex 提到首位，其余打乱。
 * 这样从列表中间点某一首进来时，那一首先播、其余随机跟随。
 */
function buildShuffledOrder(length: number, startIndex: number): number[] {
  const rest = shuffleIndices(length).filter((i) => i !== startIndex);
  return startIndex >= 0 && startIndex < length ? [startIndex, ...rest] : rest;
}

/**
 * 计算 next/prev 的目标下标。返回 null 表示无歌可切。
 * - shuffle：沿 playOrder 前后移动
 * - repeat-all：到边界回绕
 * - order / repeat-one：到边界停住（repeat-one 的自动重播由 ended 处理，
 *   手动点「下一首」仍应切到下一首，符合常见播放器语义）
 */
function resolveStep(
  mode: PlayMode,
  playOrder: number[],
  index: number,
  trackCount: number,
  direction: 1 | -1
): number | null {
  if (trackCount <= 0) return null;
  const repeatAll = mode === "repeat-all";
  if (mode === "shuffle" && playOrder.length === trackCount) {
    const pos = playOrder.indexOf(index);
    const nextPos = pos + direction;
    if (nextPos < 0) return null;
    if (nextPos >= playOrder.length) {
      // 随机列表播完一遍：列表循环则回到序列开头，否则停住
      return repeatAll ? playOrder[0] : null;
    }
    return playOrder[nextPos];
  }
  const target = index + direction;
  if (target < 0) return null;
  if (target >= trackCount) return repeatAll ? 0 : null;
  return target;
}

function ensureAudio(get: () => VideoAudioStore, set: (partial: Partial<VideoAudioStore>) => void) {
  if (audioEl) return audioEl;
  const el = new Audio();
  el.preload = "auto";
  el.addEventListener("play", () => set({ playing: true }));
  el.addEventListener("pause", () => set({ playing: false }));
  el.addEventListener("timeupdate", () => set({ currentTime: el.currentTime }));
  el.addEventListener("durationchange", () => set({ duration: Number.isFinite(el.duration) ? el.duration : 0 }));
  el.addEventListener("ended", () => {
    // 队列联播：按播放模式决定播完后做什么
    const { queue, index, pageIndex, playMode, playOrder, playTrackAt, playPage, video: currentVideo } = get();
    if (!queue) {
      set({ playing: false });
      return;
    }
    // 1) 先看当前视频内是否还有下一个分 P：分 P 之间始终顺序连播，
    //    不受播放模式影响（随机/单曲循环都只在"曲目"层面生效）
    const track = queue.tracks[index];
    if (track && !queue.perPage && currentVideo?.bvid === track.bvid) {
      const nextPage = pageIndex + 1;
      if (nextPage < currentVideo.pages.length) {
        void playPage(nextPage);
        return;
      }
    }
    // 2) 单曲循环：整首重播（playTrackAt 走 ?v=seq 强制重新拉流）
    if (playMode === "repeat-one") {
      void playTrackAt(index);
      return;
    }
    // 3) autoNext 是「顺序/随机是否自动前进」的总开关
    if (!useSettingsStore.getState().settings.listen.autoNext) {
      set({ playing: false });
      return;
    }
    const target = resolveStep(playMode, playOrder, index, queue.tracks.length, 1);
    if (target == null) {
      set({ playing: false });
      return;
    }
    void playTrackAt(target);
  });
  el.addEventListener("error", () => {
    if (el.src) set({ playing: false, loading: false, error: "音频加载失败，请重试" });
  });
  audioEl = el;
  return el;
}

export const useVideoAudioStore = create<VideoAudioStore>((set, get) => {
  const patch = (partial: Partial<VideoAudioStore>) => set(partial);

  const playTrackAt = async (queue: PlayQueue, index: number, pageIndex = 0) => {
    const seq = ++loadSeq;
    const track = queue.tracks[index];
    if (!track) return;
    const audio = ensureAudio(get, patch);
    const previous = get();
    // 换了队列就重建随机序列（当前曲目排首位）；同队列内切曲保留原序列，
    // 否则每次 next 都重新洗牌会让「随机」变成「只播当前这首」
    const queueChanged = previous.queue?.key !== queue.key || previous.queue?.tracks !== queue.tracks;
    const playOrder = previous.playMode === "shuffle" && !queueChanged && previous.playOrder.length === queue.tracks.length
      ? previous.playOrder
      : buildShuffledOrder(queue.tracks.length, index);
    set({
      queue,
      index,
      pageIndex,
      playOrder,
      loading: true,
      error: null,
      currentTime: 0,
      duration: track.duration,
      // 切到不同视频时清掉旧解析信息，播放器页据此重新加载
      video: get().video?.bvid === track.bvid ? get().video : null,
    });
    try {
      // 曲目无 cid（收藏夹/搜索整视频入队）时经 view 解析
      let video = get().video?.bvid === track.bvid ? get().video : null;
      let cid: number;
      if (!video) {
        video = await tauriCommands.video.getInfo(track.bvid);
        if (seq !== loadSeq) return;
        set({ video });
      }
      // perPage 队列（分P/合集展开）每个曲目自带 cid，直接用；
      // 否则按 pageIndex 取该视频的第 N P（稍后再看虽带 cid，仍以 pageIndex 为准），
      // 越界则退回第一 P
      let pageDuration = track.duration;
      if (queue.perPage) {
        cid = track.cid ?? video.pages[0]?.cid ?? 0;
      } else {
        const page = video.pages[pageIndex] ?? video.pages[0];
        cid = page?.cid ?? 0;
        // 分 P 的时长与整视频不同，进度条应按当前 P 计算
        if (page?.duration) pageDuration = page.duration;
        if (pageIndex > 0 && !video.pages[pageIndex]) set({ pageIndex: 0 });
      }
      if (pageDuration !== track.duration) set({ duration: pageDuration });
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
    pageIndex: 0,
    playing: false,
    loading: false,
    currentTime: 0,
    duration: 0,
    volume: useSettingsStore.getState().settings.audio.defaultVolume,
    error: null,
    playMode: "order",
    playOrder: [],

    playQueue: (queue, index) => playTrackAt(queue, index),

    playVideo: async (video, pageIndex) => {
      await playTrackAt(videoToQueue(video), pageIndex);
    },

    playTrackAt: (index) => {
      const { queue } = get();
      if (!queue) return Promise.resolve();
      return playTrackAt(queue, index);
    },

    playPage: async (pageIndex) => {
      const { queue, index } = get();
      if (!queue) return;
      // perPage 队列里每个分 P 本身就是独立曲目，应改用 playTrackAt 定位曲目
      if (queue.perPage) return;
      await playTrackAt(queue, index, pageIndex);
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
      const { queue, index, playMode, playOrder, playTrackAt } = get();
      if (!queue) return;
      const target = resolveStep(playMode, playOrder, index, queue.tracks.length, 1);
      if (target == null) return;
      await playTrackAt(target);
    },

    prev: async () => {
      const { queue, index, playMode, playOrder, playTrackAt } = get();
      if (!queue) return;
      const target = resolveStep(playMode, playOrder, index, queue.tracks.length, -1);
      if (target == null) return;
      await playTrackAt(target);
    },

    canNext: () => {
      const { queue, index, playMode, playOrder } = get();
      if (!queue) return false;
      return resolveStep(playMode, playOrder, index, queue.tracks.length, 1) != null;
    },

    canPrev: () => {
      const { queue, index, playMode, playOrder } = get();
      if (!queue) return false;
      return resolveStep(playMode, playOrder, index, queue.tracks.length, -1) != null;
    },

    setPlayMode: (mode) => {
      // 切入随机模式时按当前曲目重建序列，保证「从这首开始随便放」
      if (mode === "shuffle") {
        const { queue, index } = get();
        set({
          playMode: mode,
          playOrder: queue ? buildShuffledOrder(queue.tracks.length, index) : [],
        });
        return;
      }
      set({ playMode: mode });
    },

    cyclePlayMode: () => {
      const current = get().playMode;
      const nextIndex = (PLAY_MODE_ORDER.indexOf(current) + 1) % PLAY_MODE_ORDER.length;
      get().setPlayMode(PLAY_MODE_ORDER[nextIndex]);
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
      // 同值短路：联动广播回声/重复 tick 不再触发写回
      if (get().volume === clamped) return;
      set({ volume: clamped });
      if (audioEl) audioEl.volume = clamped / 100;
      scheduleGlobalVolumeSync(clamped);
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
        pageIndex: 0,
        playing: false,
        loading: false,
        currentTime: 0,
        duration: 0,
        error: null,
        playOrder: [],
      });
    },
  };
});

// 加载持久化设置或全局音量被其他窗口调节时同步到本播放器；
// 普通设置刷新不覆盖播放器的临时音量（同值短路在 setVolume 内）。
useSettingsStore.subscribe((state, previous) => {
  if (state.settings.audio.defaultVolume !== previous.settings.audio.defaultVolume) {
    useVideoAudioStore.getState().setVolume(state.settings.audio.defaultVolume);
  }
});
