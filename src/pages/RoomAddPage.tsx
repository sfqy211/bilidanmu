import { useEffect, useState } from "react";
import { MonitorPlay, Plus } from "lucide-react";
import { AddSearchPage, type AddSearchMode } from "@/components/add/AddSearchPage";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { tauriCommands } from "@/lib/tauri";
import { useRoomStore } from "@/stores/room-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { SearchRoomMode, SearchRoomResult } from "@/types/bilibili";

const searchModes: AddSearchMode[] = [
  { value: "name", label: "主播名字", placeholder: "输入主播名字搜索直播间" },
  { value: "roomId", label: "直播间号", placeholder: "输入直播间号" },
  { value: "link", label: "直播链接", placeholder: "粘贴 bilibili 直播间链接" },
  { value: "uid", label: "UID", placeholder: "输入主播 UID" }
];

/** 添加主播子页：与添加视频共用 AddSearchPage 的搜索框与结果区。 */
export function RoomAddPage() {
  const { rooms, addRoom } = useRoomStore();
  const showAvatars = useSettingsStore((state) => state.settings.showAvatars);
  const [followLives, setFollowLives] = useState<SearchRoomResult[]>([]);
  const [followLoading, setFollowLoading] = useState(true);
  const [addingRoomIds, setAddingRoomIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<{ message: string; key: number } | null>(null);

  const showError = (message: string) => setError((prev) => ({ message, key: (prev?.key ?? 0) + 1 }));

  const loadFollowLives = async () => {
    setFollowLoading(true);
    try {
      setFollowLives(await tauriCommands.room.getFollowLives());
    } catch (reason) {
      showError(reason instanceof Error ? reason.message : "获取关注直播失败");
      setFollowLives([]);
    } finally {
      setFollowLoading(false);
    }
  };

  useEffect(() => {
    void loadFollowLives();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async (roomId: number) => {
    setAddingRoomIds((prev) => new Set(prev).add(roomId));
    try {
      addRoom(await tauriCommands.room.add(roomId));
    } catch (reason) {
      showError(reason instanceof Error ? reason.message : "添加失败");
    } finally {
      setAddingRoomIds((prev) => {
        const next = new Set(prev);
        next.delete(roomId);
        return next;
      });
    }
  };

  const renderRow = (room: SearchRoomResult) => {
    const added = rooms.some((item) => item.roomId === room.roomId);
    return (
      <div className="flex items-center gap-3 border-b border-subtle py-3">
        {showAvatars && (room.avatar ? (
          <ProxiedImage src={room.avatar} alt={room.uname} className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-medium text-brand">
            {room.uname.charAt(0)}
          </div>
        ))}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{room.uname}</p>
            {room.isLive && <span className="live-dot h-2 w-2 shrink-0 rounded-full bg-brand" />}
          </div>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{room.title}</p>
        </div>
        <span className="numeric shrink-0 text-xs text-slate-400 dark:text-slate-500">{room.roomId}</span>
        {added ? (
          <span className="shrink-0 px-2 text-xs text-slate-400 dark:text-slate-500">已添加</span>
        ) : (
          <button
            onClick={() => void handleAdd(room.roomId)}
            disabled={addingRoomIds.has(room.roomId)}
            className="workspace-button workspace-icon-button shrink-0"
            title="添加"
            aria-label={`添加 ${room.uname}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <AddSearchPage<SearchRoomResult>
      title="添加直播间"
      description="搜索直播间，或从正在直播的关注中直接添加。"
      backTo="/rooms"
      backLabel="返回直播间列表"
      modes={searchModes}
      defaultMode="name"
      onSearch={(query, mode) => tauriCommands.room.search(query, mode as SearchRoomMode)}
      itemKey={(room) => String(room.roomId)}
      renderRow={renderRow}
      emptyResultText="没有匹配的直播间"
      initial={{ title: "正在直播的关注", items: followLives, loading: followLoading,
        onRefresh: () => void loadFollowLives(), emptyText: "关注的主播当前没有正在直播的", icon: MonitorPlay }}
      externalError={error}
    />
  );
}
