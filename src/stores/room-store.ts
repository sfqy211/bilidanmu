import { create } from "zustand";
import type { Room, RoomInfo, SearchRoomResult } from "@/types/bilibili";

export type RoomViewMode = "card" | "list";

interface RoomState {
  rooms: Room[];
  currentRoomId: string | null;
  searchResults: SearchRoomResult[];
  viewMode: RoomViewMode;
  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room | RoomInfo) => void;
  removeRoom: (roomId: number) => void;
  setCurrentRoomId: (id: string | null) => void;
  setSearchResults: (results: SearchRoomResult[]) => void;
  setViewMode: (mode: RoomViewMode) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  rooms: [],
  currentRoomId: null,
  searchResults: [],
  viewMode: "card",
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
      currentRoomId:
        state.currentRoomId === String(roomId) ? null : state.currentRoomId
    })),
  setCurrentRoomId: (currentRoomId) => set({ currentRoomId }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setViewMode: (viewMode) => set({ viewMode })
}));
