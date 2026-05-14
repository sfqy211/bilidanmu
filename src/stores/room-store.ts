import { create } from "zustand";
import type { Room, RoomInfo } from "@/types/bilibili";

interface RoomState {
  rooms: Room[];
  currentRoomId: string | null;
  searchResults: Room[];
  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room | RoomInfo) => void;
  removeRoom: (roomId: number) => void;
  setCurrentRoomId: (id: string | null) => void;
  setSearchResults: (results: Room[]) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  rooms: [],
  currentRoomId: null,
  searchResults: [],
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
  setSearchResults: (searchResults) => set({ searchResults })
}));
