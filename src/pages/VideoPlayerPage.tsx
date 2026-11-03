import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ImageIcon, Loader2 } from "lucide-react";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { PlayerControls } from "@/components/listen/PlayerControls";
import { PlaylistTreePanel } from "@/components/listen/PlaylistTreePanel";
import { SubtitlePanel, type SubtitleLine } from "@/components/listen/SubtitlePanel";
import { tauriCommands } from "@/lib/tauri";
import { getRememberedRoute } from "@/lib/app-history";
import { useProxyImage } from "@/hooks/useProxyImage";
import { useVideoAudioStore } from "@/stores/video-audio-store";
import { useSettingsStore } from "@/stores/settings-store";

/** 字幕优先的播放页：封面缩成标题旁的小缩略图，阅读区独占整行。 */
export function VideoPlayerPage() {
  const navigate = useNavigate();
  const { bvid } = useParams();
  const { video, queue, index, pageIndex, currentTime, error, playVideo, seek } = useVideoAudioStore();
  const preferences = useSettingsStore((state) => state.settings.listen);
  const isCurrentVideo = video?.bvid === bvid;
  const track = queue?.tracks[index];
  const coverSource = useProxyImage(isCurrentVideo ? video?.cover : undefined);
  const showCovers = preferences.showCovers;
  const [reloadKey, setReloadKey] = useState(0);
  const [treeOpen, setTreeOpen] = useState(false);
  const [subtitle, setSubtitle] = useState<{ loading: boolean; failed: boolean; lines: SubtitleLine[] }>({ loading: false, failed: false, lines: [] });

  // 记录挂载时 store 的曲目位置：检测「播放器自动前进」与「用户主动导航」的区别
  const trackSignature = `${queue?.key ?? ""}#${index}`;
  const lastTrackRef = useRef(trackSignature);

  useEffect(() => {
    const advanced = lastTrackRef.current !== trackSignature;
    lastTrackRef.current = trackSignature;
    if (!bvid) return;
    const currentTrack = queue?.tracks[index];
    // 播放器自动前进（列表联播/下一首）：让路由跟随当前曲目，不要重建成单视频队列
    if (advanced && currentTrack) {
      if (currentTrack.bvid !== bvid) {
        navigate(`/listen/video/${currentTrack.bvid}`, { replace: true });
      }
      return;
    }
    if (isCurrentVideo) return;
    // 队列当前曲目就是本路由的 bvid：说明是列表点进来/自动前进后的正常停留，
    // 只是 video 详情还没解析完，绝不能在这里重建成单视频队列（否则会把联播队列打回单曲）
    if (currentTrack?.bvid === bvid) return;
    // 用户直接打开某个 bvid（无队列或队列不含它）：按单视频建队从 P1 播
    let cancelled = false;
    void tauriCommands.video.getInfo(bvid)
      .then((info) => { if (!cancelled) return playVideo(info, 0); })
      .catch((reason) => {
        if (!cancelled) useVideoAudioStore.setState({ error: reason instanceof Error ? reason.message : "无法读取视频信息，请稍后重试" });
      });
    return () => { cancelled = true; };
  }, [bvid, isCurrentVideo, trackSignature, queue, index, playVideo, navigate]);

  // 当前实际播放的 cid：perPage 队列（分P/合集展开）每个曲目自带 cid；
  // 普通队列（收藏夹/稍后再看）由 pageIndex 决定具体第几 P——
  // 注意稍后再看的 track 虽带 cid，但它只是"上次看到哪一P"的初值，切分P后必须按 pageIndex 走
  const currentCid = video
    ? (queue?.perPage
        ? (track?.cid ?? video.pages[0]?.cid)
        : (video.pages[pageIndex]?.cid ?? video.pages[0]?.cid))
    : undefined;
  const videoBvid = video?.bvid;
  useEffect(() => {
    let cancelled = false;
    if (!isCurrentVideo || !videoBvid || currentCid == null) {
      setSubtitle({ loading: false, failed: false, lines: [] });
      return;
    }
    setSubtitle({ loading: true, failed: false, lines: [] });
    void tauriCommands.video.getSubtitle(videoBvid, currentCid)
      .then((lines) => { if (!cancelled) setSubtitle({ loading: false, failed: false, lines }); })
      .catch(() => { if (!cancelled) setSubtitle({ loading: false, failed: true, lines: [] }); });
    return () => { cancelled = true; };
  }, [videoBvid, currentCid, isCurrentVideo, reloadKey]);

  const activeIndex = useMemo(() => {
    let active = -1;
    for (let index = 0; index < subtitle.lines.length; index++) {
      if (currentTime < subtitle.lines[index].from) break;
      active = index;
    }
    return active;
  }, [subtitle.lines, currentTime]);

  if (error) return <section className="flex h-full flex-col"><InlineMessage type="error">{error}</InlineMessage></section>;
  if (!isCurrentVideo) return <div className="workspace-empty h-full" role="status"><Loader2 className="h-4 w-4 animate-spin" />正在解析视频…</div>;
  if (!video || !queue || !track) return <div className="workspace-empty h-full">没有加载中的视频</div>;

  return (
    <section className="listen-player app-rise"
      onContextMenu={(event) => { if (!import.meta.env.DEV) event.preventDefault(); }}>
      <header className="listen-player-heading">
        <div className="listen-player-heading-row">
          <button
            onClick={() => navigate(getRememberedRoute())}
            className="glass-panel inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
            title="返回上一页"
            aria-label="返回上一页"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {showCovers && (
            <figure className="listen-player-cover-thumb">
              {video.cover ? <img src={coverSource} alt="" /> : <ImageIcon className="h-4 w-4" />}
            </figure>
          )}
          <div className="min-w-0">
            <h2 className="listen-player-title" title={track.title}>{track.title}</h2>
            <p className="listen-player-meta"><span>{track.ownerName}</span><span aria-hidden="true">·</span><span title={queue.title}>{queue.title}</span></p>
          </div>
        </div>
      </header>
      <div className={treeOpen ? "listen-player-body-with-tree" : "listen-player-body"}>
        <SubtitlePanel lines={subtitle.lines} loading={subtitle.loading} failed={subtitle.failed} activeIndex={activeIndex}
          currentTime={currentTime} onSeek={seek} onRetry={() => setReloadKey((key) => key + 1)} />
        {treeOpen && <PlaylistTreePanel video={video} onClose={() => setTreeOpen(false)} />}
      </div>
      <PlayerControls
        onComments={() => navigate(`/listen/video/${video.bvid}/comments`)}
        treeOpen={treeOpen}
        onToggleTree={() => setTreeOpen((open) => !open)}
      />
    </section>
  );
}
