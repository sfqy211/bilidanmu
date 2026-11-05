import { useCallback, useState } from "react";
import { tauriCommands, type SendGiftOptions } from "@/lib/tauri";
import { useDanmakuStore } from "@/stores/danmaku-store";

/** 从各种错误格式中提取消息 */
function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}

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
        const message = extractErrorMessage(error, "发送弹幕失败");
        setLastError(message);
        throw error;
      } finally {
        setSending(false);
      }
    },
    [incrementSentCount, setLastError]
  );

  const sendEmoticon = useCallback(
    async (roomId: number, emoticonUnique: string, emoticonOptions?: string) => {
      setSending(true);
      try {
        const result = await tauriCommands.danmaku.sendEmoticon(roomId, emoticonUnique, {
          emoticonOptions
        });
        incrementSentCount();
        setLastError(null);
        return result;
      } catch (error) {
        const message = extractErrorMessage(error, "发送表情弹幕失败");
        setLastError(message);
        throw error;
      } finally {
        setSending(false);
      }
    },
    [incrementSentCount, setLastError]
  );

  /** 发送礼物（打赏）。礼物不计入弹幕发送统计；金瓜子为真实扣费，确认逻辑由 GiftPanel 负责 */
  const sendGift = useCallback(
    async (
      roomId: number,
      ruid: number,
      giftId: number,
      giftNum: number,
      options?: SendGiftOptions
    ) => {
      setSending(true);
      try {
        const result = await tauriCommands.gift.sendGift(roomId, ruid, giftId, giftNum, options);
        setLastError(null);
        return result;
      } catch (error) {
        const message = extractErrorMessage(error, "发送礼物失败");
        setLastError(message);
        throw error;
      } finally {
        setSending(false);
      }
    },
    [setLastError]
  );

  return {
    sending,
    send,
    sendEmoticon,
    sendGift
  };
}
