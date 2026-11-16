import { useEffect, useRef, useState } from "react";
import { Expand, Loader2, MousePointerClick, Send, Settings } from "lucide-react";
import { toast } from "sonner";
import { AccountSwitcher } from "@/components/danmaku/AccountSwitcher";
import { DanmakuInput } from "@/components/danmaku/DanmakuInput";
import { DanmakuWindowButton as VideoWindowButton } from "@/components/danmaku/DanmakuWindow";
import type { useVideoWindowModes } from "@/hooks/useVideoWindow";
import { useAuthStore } from "@/stores/auth-store";
import { tauriCommands } from "@/lib/tauri";
import { formatClock } from "@/lib/time";
import type { VideoDanmaku, VideoPlaybackSnapshot } from "@/types/video-window";

export function VideoWindowComposer({ playback, modes, settingsOpen, settingsReady, onToggleSettings, onSent }: {
  playback: VideoPlaybackSnapshot | null;
  modes: ReturnType<typeof useVideoWindowModes>;
  settingsOpen: boolean;
  settingsReady: boolean;
  onToggleSettings: () => void;
  onSent: (item: VideoDanmaku) => void;
}) {
  const { activeAccountId, isAnonymous } = useAuthStore();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const identity = `${playback?.bvid ?? ""}:${playback?.cid ?? ""}`;
  const identityRef = useRef(identity);
  useEffect(() => { identityRef.current = identity; }, [identity]);
  const canSend = !!activeAccountId && !isAnonymous && !!playback?.cid && !playback.loading;
  const currentTime = playback?.currentTime ?? 0;

  const send = async () => {
    if (!canSend || !playback?.bvid || !playback.cid || !message.trim() || sendingRef.current) return;
    const text = message.trim();
    sendingRef.current = true;
    setSending(true);
    try {
      const result = await tauriCommands.video.sendDanmaku(playback.bvid, playback.cid, text, currentTime);
      if (identityRef.current === identity) {
        onSent(result);
        setMessage((current) => current.trim() === text ? "" : current);
      }
      toast.success(`弹幕已发送到 ${formatClock(result.progress)}`);
    } catch (reason) {
      toast.error(String(reason));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return <div className="video-window-input">
    {!modes.inputOnly && <>
      <AccountSwitcher viewingAccountId={activeAccountId} />
      <VideoWindowButton title="窗口设置" active={settingsOpen} disabled={!settingsReady} onClick={onToggleSettings}><Settings /></VideoWindowButton>
    </>}
    <DanmakuInput aria-label="发送视频弹幕" maxLength={100} value={message} disabled={!canSend || sending}
      placeholder={canSend ? `发送弹幕到 ${formatClock(currentTime)}` : isAnonymous || !activeAccountId ? "登录账号后发送视频弹幕" : "等待视频加载…"}
      onChange={setMessage} onSend={() => void send()} />
    <VideoWindowButton title="发送弹幕" onClick={() => void send()} disabled={!canSend || !message.trim() || sending}>
      {sending ? <Loader2 className="animate-spin" /> : <Send />}
    </VideoWindowButton>
    {modes.inputOnly && <>
      <VideoWindowButton title="移动窗口" disabled={modes.locked}
        onPointerDown={(event) => { if (event.button === 0) modes.startDragging(); }}><MousePointerClick /></VideoWindowButton>
      <VideoWindowButton title="恢复完整窗口" disabled={modes.changingMode} onClick={() => void modes.toggleInputOnly()}><Expand /></VideoWindowButton>
    </>}
  </div>;
}
