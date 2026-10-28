import { create } from "zustand";
import type { Room, RoomInfo } from "@/types/bilibili";

export type RoomViewMode = "card" | "list";

interface RoomState {
  rooms: Room[];
  currentRoomId: string | null;
  viewMode: RoomViewMode;
  /** 收藏的直播间 roomId（本地数据，与 B 站账号无关） */
  favoriteIds: number[];
  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room | RoomInfo) => void;
  removeRoom: (roomId: number) => void;
  setCurrentRoomId: (id: string | null) => void;
  setViewMode: (mode: RoomViewMode) => void;
  setFavoriteIds: (ids: number[]) => void;
  toggleFavorite: (roomId: number) => boolean;
}

export const useRoomStore = create<RoomState>((set, get) => ({
  rooms: [],
  currentRoomId: null,
  viewMode: "card",
  favoriteIds: [],
  setRooms: (rooms) => set({ rooms }),
  addRoom: (room) =>
    set((state) => ({
      rooms: state.rooms.some((item) => item.roomId === room.roomId)
        ? state.rooms
        : [...state.rooms, room]
    })),
  removeRoom: (roomId) =>
    set((state) => ({
      rooms: state.rooms.filter((room) => room.roomId !== roomId),
      favoriteIds: state.favoriteIds.filter((id) => id !== roomId),
      currentRoomId:
        state.currentRoomId === String(roomId) ? null : state.currentRoomId
    })),
  setCurrentRoomId: (currentRoomId) => set({ currentRoomId }),
  setViewMode: (viewMode) => set({ viewMode }),
  setFavoriteIds: (favoriteIds) => set({ favoriteIds }),
  toggleFavorite: (roomId) => {
    const has = get().favoriteIds.includes(roomId);
    const next = has
      ? get().favoriteIds.filter((id) => id !== roomId)
      : [...get().favoriteIds, roomId];
    set({ favoriteIds: next });
    return !has;
  }
}));
