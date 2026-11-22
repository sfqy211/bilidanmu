import { useTranslation as useDesktopTranslation } from "@/i18n";
import { useEffect, useState } from "react";
import { MonitorPlay, Plus } from "lucide-react";
import { AddSearchPage, type AddSearchMode } from "@/components/add/AddSearchPage";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { tauriCommands } from "@/lib/tauri";
import { useRoomStore } from "@/stores/room-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { SearchRoomMode, SearchRoomResult } from "@/types/bilibili";


/** 添加主播子页：与添加视频共用 AddSearchPage 的搜索框与结果区。 */
export function RoomAddPage() {
  const { t: translate } = useDesktopTranslation("desktop");
  const searchModes: AddSearchMode[] = [
    { value: "name", label: translate("addRoom.streamer"), placeholder: translate("addRoom.streamerHint") },
    { value: "roomId", label: translate("addRoom.roomId"), placeholder: translate("addRoom.roomIdHint") },
    { value: "link", label: translate("addRoom.link"), placeholder: translate("addRoom.linkHint") },
    { value: "uid", label: "UID", placeholder: translate("addRoom.uidHint") }
  ];
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
      showError(reason instanceof Error ? reason.message : translate("addRoom.followingFailed"));
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
      showError(reason instanceof Error ? reason.message : translate("addRoom.failed"));
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
      <div className="add-result-row flex items-center gap-3 px-4 py-3">
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
          <span className="shrink-0 px-2 text-xs text-slate-400 dark:text-slate-500">{translate("addRoom.added")}</span>
        ) : (
          <button
            onClick={() => void handleAdd(room.roomId)}
            disabled={addingRoomIds.has(room.roomId)}
            className="workspace-button workspace-icon-button shrink-0"
            title={translate("addRoom.add")}
            aria-label={translate("addRoom.addStreamer", { value: room.uname })}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <AddSearchPage<SearchRoomResult>
      title={translate("addRoom.title")}
      description={translate("addRoom.description")}
      backTo="/rooms"
      backLabel={translate("addRoom.back")}
      modes={searchModes}
      defaultMode="name"
      onSearch={(query, mode) => tauriCommands.room.search(query, mode as SearchRoomMode)}
      itemKey={(room) => String(room.roomId)}
      renderRow={renderRow}
      emptyResultText={translate("addRoom.empty")}
      initial={{ title: translate("addRoom.following"), items: followLives, loading: followLoading,
        onRefresh: () => void loadFollowLives(), emptyText: translate("addRoom.followingEmpty"), icon: MonitorPlay }}
      externalError={error}
    />
  );
}
