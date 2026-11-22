import { useTranslation as useDesktopTranslation } from "@/i18n";
import { useNavigate } from "react-router-dom";
import { Play, Search } from "lucide-react";
import { AddSearchPage, type AddSearchMode } from "@/components/add/AddSearchPage";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { tauriCommands } from "@/lib/tauri";
import { formatClock } from "@/lib/time";
import { useSettingsStore } from "@/stores/settings-store";

interface VideoCandidate {
  bvid: string;
  title: string;
  author: string;
  cover?: string;
  duration: number;
}


/** 从输入提取 BV 号：兼容纯 BV 号、完整链接、带参数链接 */
function extractBvid(input: string): string | null {
  return input.match(/BV[0-9A-Za-z]{10}/)?.[0] ?? null;
}


/** 添加视频子页：与添加主播共用 AddSearchPage，BV 号也会先展示结果供确认。 */
export function VideoAddPage() {
  const { t: translate } = useDesktopTranslation("desktop");
  const searchModes: AddSearchMode[] = [
    { value: "keyword", label: translate("addVideo.searchByTitle"), placeholder: translate("addVideo.titleHint") },
    { value: "bvid", label: translate("addVideo.searchByLink"), placeholder: translate("addVideo.linkHint") }
  ];
  const navigate = useNavigate();

  const handleSearch = async (query: string, mode: string): Promise<VideoCandidate[]> => {
    // 无论当前模式，只要能识别出 BV 号都先解析成单条结果，交给用户确认。
    const bvid = extractBvid(query);
    if (bvid) {
      const info = await tauriCommands.video.getInfo(bvid);
      return [{ bvid: info.bvid, title: info.title, author: info.ownerName, cover: info.cover, duration: info.duration }];
    }
    if (mode === "bvid") throw new Error(translate("addVideo.invalidLink"));
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
      title={translate("addVideo.title")}
      description={translate("addVideo.description")}
      backTo="/listen"
      backLabel={translate("addVideo.back")}
      modes={searchModes}
      defaultMode="keyword"
      onSearch={handleSearch}
      itemKey={(video) => video.bvid}
      renderRow={(video) => (
        <div className="add-result-row flex items-center gap-3 px-4 py-3">
          {video.cover ? (
            <ProxiedImage src={video.cover} alt="" className="h-9 w-16 shrink-0 rounded object-cover" />
          ) : (
            <div className="h-9 w-16 shrink-0 rounded bg-brand/10" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{video.title}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{video.author}</p>
          </div>
          <span className="numeric shrink-0 text-xs text-slate-400 dark:text-slate-500">{formatClock(video.duration)}</span>
          <button
            onClick={() => navigate(`/listen/video/${video.bvid}`)}
            className="workspace-button workspace-icon-button shrink-0"
            title={translate("addVideo.play")}
            aria-label={translate("addVideo.playVideo", { value: video.title })}
          >
            <Play className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      emptyResultText={translate("addVideo.empty")}
      idle={{ text: translate("addVideo.initial"), icon: Search }}
    />
  );
}
