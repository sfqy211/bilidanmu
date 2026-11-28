import { useTranslation as useDesktopTranslation } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Settings } from "lucide-react";
import { toast } from "sonner";
import { AccountSwitcher } from "@/components/danmaku/AccountSwitcher";
import { DanmakuInput } from "@/components/danmaku/DanmakuInput";
import { DanmakuWindowButton as VideoWindowButton } from "@/components/danmaku/DanmakuWindow";
import { useAuthStore } from "@/stores/auth-store";
import { tauriCommands } from "@/lib/tauri";
import { formatClock } from "@/lib/time";
import type { VideoDanmaku, VideoPlaybackSnapshot } from "@/types/video-window";

export function VideoWindowComposer({ playback, settingsOpen, settingsReady, onToggleSettings, onSent }: {
  playback: VideoPlaybackSnapshot | null;
  settingsOpen: boolean;
  settingsReady: boolean;
  onToggleSettings: () => void;
  onSent: (item: VideoDanmaku) => void;
}) {
  const { t: translate } = useDesktopTranslation("desktop");
  const { activeAccountId, isAnonymous } = useAuthStore();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [fullscreenInputActive, setFullscreenInputActive] = useState(false);
  const sendButton = useRef<HTMLButtonElement>(null);
  const sendingRef = useRef(false);
  const identity = `${playback?.bvid ?? ""}:${playback?.cid ?? ""}`;
  const identityRef = useRef(identity);
  useEffect(() => { identityRef.current = identity; }, [identity]);
  const hasAccount = !!activeAccountId && !isAnonymous;
  const canSend = hasAccount && !!playback?.cid && !playback.loading;
  const sendDisabled = !canSend || sending;
  const currentTime = playback?.currentTime ?? 0;

  const send = async (draft = message) => {
    if (!canSend || !playback?.bvid || !playback.cid || !draft.trim() || sendingRef.current) return;
    const text = draft.trim();
    sendingRef.current = true;
    setSending(true);
    try {
      const result = await tauriCommands.video.sendDanmaku(playback.bvid, playback.cid, text, currentTime);
      if (identityRef.current === identity) {
        onSent(result);
        setMessage((current) => current.trim() === text ? "" : current);
      }
      toast.success(translate("videoComposer.sent", { value: formatClock(result.progress) }));
    } catch (reason) {
      toast.error(String(reason));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return <div className="video-window-input">
    <AccountSwitcher viewingAccountId={activeAccountId} />
    <VideoWindowButton title={translate("videoComposer.settings")} active={settingsOpen} disabled={!settingsReady} onClick={onToggleSettings}><Settings /></VideoWindowButton>
    <DanmakuInput aria-label={translate("videoComposer.label")} maxLength={100} value={message} disabled={sendDisabled}
      fullscreenSessionKey={`${identity}:${activeAccountId ?? ""}`} onFullscreenInputActiveChange={setFullscreenInputActive}
      fullscreenSubmit={{ button: sendButton, label: translate("videoComposer.send") }}
      placeholder={canSend ? translate("videoComposer.at", { value: formatClock(currentTime) }) : hasAccount ? translate("videoComposer.waiting") : translate("videoComposer.signIn")}
      onChange={setMessage} onSend={(draft) => void send(draft)} />
    <VideoWindowButton ref={sendButton} title={translate("videoComposer.send")}
      onClick={() => { if (!fullscreenInputActive) void send(); }}
      disabled={sendDisabled || (!fullscreenInputActive && !message.trim())}>
      {sending ? <Loader2 className="animate-spin" /> : <Send />}
    </VideoWindowButton>
  </div>;
}
