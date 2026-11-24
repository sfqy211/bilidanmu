import { useCallback, useEffect, useState } from "react";
import {
  listAudioOutputDevices,
  supportsAudioOutputSelection,
  type AudioOutputDevice,
} from "@/lib/audio-output";

/**
 * 系统音频输出设备列表（设置页用）。
 * 设备插拔时自动刷新；不支持按设备路由的平台返回 supported=false。
 */
export function useAudioOutputDevices() {
  const supported = supportsAudioOutputSelection();
  const [devices, setDevices] = useState<AudioOutputDevice[]>([]);
  const [loading, setLoading] = useState(supported);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    setError(null);
    try {
      setDevices(await listAudioOutputDevices());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [supported]);

  useEffect(() => {
    if (supported) void refresh();
  }, [supported, refresh]);

  useEffect(() => {
    if (!supported) return;
    const mediaDevices = navigator.mediaDevices;
    const onDeviceChange = () => { void refresh(); };
    mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => mediaDevices.removeEventListener("devicechange", onDeviceChange);
  }, [supported, refresh]);

  return { supported, devices, loading, error, refresh };
}
