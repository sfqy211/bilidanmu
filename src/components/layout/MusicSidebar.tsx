import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { Clock, Disc3, ListMusic, Search } from "lucide-react";
import { getAppVersion } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useVideoAudioStore } from "@/stores/video-audio-store";

/** 音乐模式侧栏：搜索 / 收藏夹 / 稍后再看 / 正在播放（唱片） */
export function MusicSidebar() {
  const [version, setVersion] = useState("");
  const video = useVideoAudioStore((s) => s.video);

  useEffect(() => {
    getAppVersion().then(setVersion).catch(() => {});
  }, []);

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "group relative flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-xl text-slate-400 transition-all duration-200 hover:bg-black/[0.05] hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-white",
      isActive && "glass-panel text-brand hover:text-brand dark:text-brand dark:hover:text-brand"
    );

  const labelClass = (isActive: boolean) =>
    cn("text-[9px] leading-none transition-opacity", isActive ? "font-semibold opacity-100" : "opacity-0 group-hover:opacity-70");

  return (
    <aside className="flex w-16 flex-col items-center py-3">
      <nav className="flex flex-1 flex-col items-center gap-1.5">
        <NavLink to="/listen/search" title="搜索视频" className={itemClass}>
          {({ isActive }) => (
            <>
              <Search className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.2 : 1.8} />
              <span className={labelClass(isActive)}>搜索</span>
            </>
          )}
        </NavLink>

        <NavLink to="/listen" title="收藏夹" className={itemClass} end>
          {({ isActive }) => (
            <>
              <ListMusic className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.2 : 1.8} />
              <span className={labelClass(isActive)}>收藏夹</span>
            </>
          )}
        </NavLink>

        <NavLink to="/listen/watchlater" title="稍后再看" className={itemClass}>
          {({ isActive }) => (
            <>
              <Clock className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.2 : 1.8} />
              <span className={labelClass(isActive)}>稍后再看</span>
            </>
          )}
        </NavLink>

        {video ? (
          <NavLink to={`/listen/video/${video.bvid}`} title="正在播放" className={itemClass}>
            {({ isActive }) => (
              <>
                <Disc3 className={cn("h-[18px] w-[18px]", isActive && "animate-spin [animation-duration:3s]")} strokeWidth={isActive ? 2.2 : 1.8} />
                <span className={labelClass(isActive)}>正在播放</span>
              </>
            )}
          </NavLink>
        ) : (
          <div
            className="flex h-11 w-11 cursor-not-allowed flex-col items-center justify-center gap-0.5 rounded-xl text-slate-300 dark:text-slate-600"
            title="暂无播放中的音频"
          >
            <Disc3 className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </div>
        )}
      </nav>

      {version && (
        <div className="numeric text-[10px] tracking-wider text-slate-300 dark:text-slate-600">
          {version}
        </div>
      )}
    </aside>
  );
}
