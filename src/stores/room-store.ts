import { create } from "zustand";
import type { Room } from "@/types/bilibili";

interface RoomState {
  rooms: Room[];
  currentRoomId: string | null;
  setRooms: (rooms: Room[]) => void;
  setCurrentRoomId: (id: string | null) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  rooms: [],
  currentRoomId: null,
  setRooms: (rooms) => set({ rooms }),
  setCurrentRoomId: (currentRoomId) => set({ currentRoomId })
}));
