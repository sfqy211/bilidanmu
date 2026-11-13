import { useMemo, useState } from "react";
import { ChevronRight, Disc3, Layers, ListMusic, Pause, Play } from "lucide-react";
import { useVideoAudioStore, type PlayQueue } from "@/stores/video-audio-store";
import type { VideoInfo } from "@/types/bilibili";
import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/time";

/** 树节点：曲目（父节点）下的分 P 子节点 */
interface PageNode {
  cid: number;
  label: string;
  duration: number;
}

/**
 * 播放列表树：父节点 = 当前队列里的视频，子节点 = 该视频的分 P。
 * 只对「当前正在播放的视频」展开分 P 子节点——其余曲目的分 P 需要额外请求，
 * 不在渲染时批量拉取（避免打开面板就发几十个请求）。
 */
export function PlaylistTreePanel({ video, onClose }: { video: VideoInfo; onClose: () => void }) {
  const queue = useVideoAudioStore((state) => state.queue);
  const index = useVideoAudioStore((state) => state.index);
  const pageIndex = useVideoAudioStore((state) => state.pageIndex);
  const playing = useVideoAudioStore((state) => state.playing);
  const playTrackAt = useVideoAudioStore((state) => state.playTrackAt);
  const playPage = useVideoAudioStore((state) => state.playPage);
  const switchQueue = useVideoAudioStore((state) => state.switchQueue);
  const [seasonOpen, setSeasonOpen] = useState(false);

  const currentTrack = queue?.tracks[index];
  const pages: PageNode[] = useMemo(
    () => video.pages.map((page) => ({
      cid: page.cid,
      label: video.pages.length > 1 ? `P${page.page} ${page.part}` : page.part || video.title,
      duration: page.duration,
    })),
    [video]
  );

  const season = video.season;

  return (
    <aside className="listen-playlist-tree" aria-label="播放列表">
      <header className="listen-playlist-tree-header">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <ListMusic className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={queue?.title}>{queue?.title ?? "播放列表"}</span>
          </p>
          <p className="numeric mt-0.5 text-[11px] text-ink-muted">
            {queue ? `${index + 1} / ${queue.tracks.length}` : "—"}
            {pages.length > 1 ? ` · ${pages.length} 个分P` : ""}
          </p>
        </div>
        <button type="button" onClick={onClose} className="workspace-button workspace-icon-button shrink-0" title="收起列表" aria-label="收起列表">
          <ChevronRight className="h-4 w-4" />
        </button>
      </header>

      <div className="listen-playlist-tree-body">
        {queue?.tracks.map((track, trackIndex) => {
          const isCurrent = trackIndex === index;
          const hasPages = isCurrent && pages.length > 1;
          return (
            <div key={`${track.bvid}-${trackIndex}`}>
              <button
                type="button"
                onClick={() => { void playTrackAt(trackIndex); }}
                className={cn("listen-playlist-tree-row", isCurrent && "listen-playlist-tree-row-active")}
                title={track.title}
              >
                <span className="listen-playlist-tree-index numeric">
                  {isCurrent ? (playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />) : trackIndex + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs">{track.title}</span>
                  <span className="block truncate text-[11px] text-ink-muted">{track.ownerName}</span>
                </span>
                <span className="numeric shrink-0 text-[11px] text-ink-muted">{formatClock(track.duration)}</span>
              </button>

              {/* 分 P 子节点：仅当前视频展开 */}
              {hasPages && (
                <div className="listen-playlist-tree-children">
                  {pages.map((page, pi) => {
                    // perPage 队列（分P展开）下当前曲目自带 cid，按 cid 判断；否则按 pageIndex
                    const pageActive = queue.perPage ? page.cid === currentTrack?.cid : pi === pageIndex;
                    return (
                      <button
                        key={page.cid}
                        type="button"
                        onClick={() => {
                          // perPage 队列里每个分 P 是独立曲目，需要先定位到对应曲目再播
                          if (queue.perPage) {
                            const target = queue.tracks.findIndex((t) => t.bvid === track.bvid && t.cid === page.cid);
                            if (target >= 0) { void playTrackAt(target); return; }
                          }
                          void playPage(pi);
                        }}
                        className={cn("listen-playlist-tree-page", pageActive && "listen-playlist-tree-page-active")}
                        title={page.label}
                      >
                        <span className="min-w-0 flex-1 truncate text-[11px]">{page.label}</span>
                        <span className="numeric shrink-0 text-[11px] text-ink-muted">{formatClock(page.duration)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* 合集分支：只播选中的那一集 */}
        {season && season.episodes.length > 0 && (
          <div className="listen-playlist-tree-season">
            <button type="button" onClick={() => setSeasonOpen((v) => !v)} className="listen-playlist-tree-row" title={season.title}>
              <span className="listen-playlist-tree-index"><Disc3 className="h-3 w-3" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs">合集：{season.title}</span>
                <span className="block truncate text-[11px] text-ink-muted">{season.episodes.length} 个视频</span>
              </span>
              <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform text-ink-muted", seasonOpen && "rotate-90")} />
            </button>
            {seasonOpen && (
              <div className="listen-playlist-tree-children">
                {season.episodes.map((ep) => {
                  const epActive = ep.bvid === currentTrack?.bvid && ep.cid === currentTrack?.cid;
                  return (
                    <button
                      key={`${ep.bvid}-${ep.cid}`}
                      type="button"
                      onClick={() => {
                        // 只播这一集：用单集建队列，不把整个合集塞进队列
                        const single: PlayQueue = {
                          key: `single-${ep.bvid}`,
                          title: ep.title,
                          tracks: [{
                            bvid: ep.bvid,
                            cid: ep.cid,
                            title: ep.title,
                            ownerName: ep.ownerName,
                            cover: ep.cover,
                            duration: ep.duration,
                          }],
                        };
                        void switchQueue(single);
                      }}
                      className={cn("listen-playlist-tree-page", epActive && "listen-playlist-tree-page-active")}
                      title={ep.title}
                    >
                      <span className="min-w-0 flex-1 truncate text-[11px]">{ep.title}</span>
                      <span className="numeric shrink-0 text-[11px] text-ink-muted">{formatClock(ep.duration)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!queue && (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-[11px] text-ink-muted">
            <Layers className="h-6 w-6" strokeWidth={1.6} />
            播放列表为空
          </div>
        )}
      </div>
    </aside>
  );
}
