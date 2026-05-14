import { useCallback, useState } from "react";
import { tauriCommands } from "@/lib/tauri";
import { useDanmakuStore } from "@/stores/danmaku-store";

export function useDanmaku() {
  const incrementSentCount = useDanmakuStore((state) => state.incrementSentCount);
  const setLastError = useDanmakuStore((state) => state.setLastError);
  const [sending, setSending] = useState(false);

  const send = useCallback(
    async (roomId: number, msg: string) => {
      setSending(true);
      try {
        const result = await tauriCommands.danmaku.send(roomId, msg);
        incrementSentCount();
        setLastError(null);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "发送弹幕失败";
        setLastError(message);
        throw error;
      } finally {
        setSending(false);
      }
    },
    [incrementSentCount, setLastError]
  );

  const sendEmoticon = useCallback(
    async (roomId: number, emoticonUnique: string) => {
      setSending(true);
      try {
        const result = await tauriCommands.danmaku.sendEmoticon(roomId, emoticonUnique);
        incrementSentCount();
        setLastError(null);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "发送表情弹幕失败";
        setLastError(message);
        throw error;
      } finally {
        setSending(false);
      }
    },
    [incrementSentCount, setLastError]
  );

  return {
    sending,
    send,
    sendEmoticon
  };
}
