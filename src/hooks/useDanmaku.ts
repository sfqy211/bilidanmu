import { useCallback, useState } from "react";
import { tauriCommands, type SendGiftOptions } from "@/lib/tauri";
import { useDanmakuStore } from "@/stores/danmaku-store";
import { i18n } from "@/i18n";
import { describeDesktopError } from "@/i18n/errors";

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
        const message = describeDesktopError(error, i18n.t("desktop:liveWindow.sendFailed"));
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
        const message = describeDesktopError(error, i18n.t("desktop:liveWindow.sendEmoteFailed"));
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
        const message = describeDesktopError(error, i18n.t("desktop:gifts.sendFailed"));
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
