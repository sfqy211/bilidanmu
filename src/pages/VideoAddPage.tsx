import { useNavigate } from "react-router-dom";
import { Play, Search } from "lucide-react";
import { AddSearchPage, type AddSearchMode } from "@/components/add/AddSearchPage";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";

interface VideoCandidate {
  bvid: string;
  title: string;
  author: string;
  cover?: string;
  duration: number;
}

const searchModes: AddSearchMode[] = [
  { value: "keyword", label: "视频名称", placeholder: "输入视频名称搜索" },
  { value: "bvid", label: "BV 号/链接", placeholder: "粘贴 BV 号或视频链接" }
];

/** 从输入提取 BV 号：兼容纯 BV 号、完整链接、带参数链接 */
function extractBvid(input: string): string | null {
  return input.match(/BV[0-9A-Za-z]{10}/)?.[0] ?? null;
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 添加视频子页：与添加主播共用 AddSearchPage，BV 号也会先展示结果供确认。 */
export function VideoAddPage() {
  const navigate = useNavigate();
  const showCovers = useSettingsStore((state) => state.settings.listen.showCovers);

  const handleSearch = async (query: string, mode: string): Promise<VideoCandidate[]> => {
    // 无论当前模式，只要能识别出 BV 号都先解析成单条结果，交给用户确认。
    const bvid = extractBvid(query);
    if (bvid) {
      const info = await tauriCommands.video.getInfo(bvid);
      return [{ bvid: info.bvid, title: info.title, author: info.ownerName, cover: info.cover, duration: info.duration }];
    }
    if (mode === "bvid") throw new Error("请输入有效的 BV 号或视频链接");
    const page = await tauriCommands.video.searchVideos(query, 1);
    return page.list.map((item) => ({
      bvid: item.bvid,
      title: item.title,
      author: item.author,
      cover: item.cover,
      duration: item.duration
    }));
  };

  return (
    <AddSearchPage<VideoCandidate>
      title="添加视频"
      description="搜索视频，或粘贴 BV 号/链接后确认结果再播放。"
      backTo="/listen"
      backLabel="返回听视频"
      modes={searchModes}
      defaultMode="keyword"
      onSearch={handleSearch}
      itemKey={(video) => video.bvid}
      renderRow={(video) => (
        <div className="flex items-center gap-3 border-b border-subtle py-3">
          {showCovers && (video.cover ? (
            <ProxiedImage src={video.cover} alt="" className="h-9 w-16 shrink-0 rounded object-cover" />
          ) : (
            <div className="h-9 w-16 shrink-0 rounded bg-brand/10" />
          ))}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{video.title}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{video.author}</p>
          </div>
          <span className="numeric shrink-0 text-xs text-slate-400 dark:text-slate-500">{formatDuration(video.duration)}</span>
          <button
            onClick={() => navigate(`/listen/video/${video.bvid}`)}
            className="workspace-button workspace-icon-button shrink-0"
            title="播放"
            aria-label={`播放 ${video.title}`}
          >
            <Play className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      emptyResultText="没有匹配的视频"
      idle={{ text: "输入视频名称，或粘贴 BV 号/链接开始搜索", icon: Search }}
    />
  );
}
