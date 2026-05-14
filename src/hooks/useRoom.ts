import { useRoomStore } from "@/stores/room-store";

export function useRoom() {
  return useRoomStore();
}
