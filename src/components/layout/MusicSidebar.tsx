import { useLocation } from "react-router-dom";
import { Clock, Disc3, ListMusic, Search, Settings } from "lucide-react";
import { useVideoAudioStore } from "@/stores/video-audio-store";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

export function MusicSidebar() {
  const video = useVideoAudioStore((state) => state.video);
  const { pathname } = useLocation();
  return (
    <WorkspaceSidebar label="听视频导航" items={[
      { to: "/listen/search", label: "搜索视频", icon: Search },
      { to: "/listen", label: "收藏夹", icon: ListMusic, end: true, active: pathname === "/listen" || pathname.startsWith("/listen/fav/") },
      { to: "/listen/watchlater", label: "稍后再看", icon: Clock },
      { to: video ? `/listen/video/${video.bvid}` : "/listen", label: "正在播放", icon: Disc3, disabled: !video },
    ]} utilityItems={[{ to: "/settings", label: "设置", icon: Settings }]} />
  );
}
