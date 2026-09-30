import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ImageIcon, Loader2 } from "lucide-react";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { PlayerControls } from "@/components/listen/PlayerControls";
import { SubtitlePanel, type SubtitleLine } from "@/components/listen/SubtitlePanel";
import { tauriCommands } from "@/lib/tauri";
import { useProxyImage } from "@/hooks/useProxyImage";
import { useVideoAudioStore } from "@/stores/video-audio-store";
import { useSettingsStore } from "@/stores/settings-store";

/** 保留原始封面比例，字幕拥有独立阅读区；播放控制在两种视图中保持挂载。 */
export function VideoPlayerPage() {
  const navigate = useNavigate();
  const { bvid } = useParams();
  const { video, queue, index, currentTime, error, playVideo, seek } = useVideoAudioStore();
  const preferences = useSettingsStore((state) => state.settings.listen);
  const isCurrentVideo = video?.bvid === bvid;
  const track = queue?.tracks[index];
  const coverSource = useProxyImage(isCurrentVideo ? video?.cover : undefined);
  const [focusOverride, setFocus] = useState<boolean | null>(null);
  const focus = focusOverride ?? (preferences.defaultView === "subtitles");
  const [reloadKey, setReloadKey] = useState(0);
  const [subtitle, setSubtitle] = useState<{ loading: boolean; failed: boolean; lines: SubtitleLine[] }>({ loading: false, failed: false, lines: [] });

  useEffect(() => {
    if (!bvid || isCurrentVideo) return;
    let cancelled = false;
    void tauriCommands.video.getInfo(bvid)
      .then((info) => { if (!cancelled) return playVideo(info, 0); })
      .catch((reason) => {
        if (!cancelled) useVideoAudioStore.setState({ error: reason instanceof Error ? reason.message : "无法读取视频信息，请稍后重试" });
      });
    return () => { cancelled = true; };
  }, [bvid, isCurrentVideo, playVideo]);

  const currentCid = video && (track?.bvid === video.bvid && track.cid != null ? track.cid : video.pages[0]?.cid);
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
    <section className="listen-player app-rise" data-subtitle-focus={focus || undefined}
      onContextMenu={(event) => { if (!import.meta.env.DEV) event.preventDefault(); }}>
      <header className="listen-player-heading">
        <h2 className="listen-player-title" title={track.title}>{track.title}</h2>
        <p className="listen-player-meta"><span>{track.ownerName}</span><span aria-hidden="true">·</span><span title={queue.title}>{queue.title}</span></p>
      </header>
      <div className="listen-player-body">
        {!focus && (
          <figure className="listen-player-cover">
            {video.cover ? <img src={coverSource} alt={video.title} /> : <div className="listen-player-cover-empty"><ImageIcon className="h-8 w-8" /><span>暂无封面</span></div>}
          </figure>
        )}
        <SubtitlePanel lines={subtitle.lines} loading={subtitle.loading} failed={subtitle.failed} activeIndex={activeIndex}
          currentTime={currentTime} focus={focus} onFocusChange={setFocus} onSeek={seek} onRetry={() => setReloadKey((key) => key + 1)} />
      </div>
      <PlayerControls onComments={() => navigate(`/listen/video/${video.bvid}/comments`)} />
    </section>
  );
}
