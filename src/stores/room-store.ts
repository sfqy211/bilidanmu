import { create } from "zustand";
import type { Room, RoomInfo } from "@/types/bilibili";

export type RoomViewMode = "card" | "list";

interface RoomState {
  rooms: Room[];
  currentRoomId: string | null;
  viewMode: RoomViewMode;
  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room | RoomInfo) => void;
  removeRoom: (roomId: number) => void;
  setCurrentRoomId: (id: string | null) => void;
  setViewMode: (mode: RoomViewMode) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  rooms: [],
  currentRoomId: null,
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
  setViewMode: (viewMode) => set({ viewMode })
}));
