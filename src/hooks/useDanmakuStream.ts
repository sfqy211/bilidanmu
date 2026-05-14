import { useDanmakuStore } from "@/stores/danmaku-store";

export function useDanmakuStream() {
  return useDanmakuStore();
}
