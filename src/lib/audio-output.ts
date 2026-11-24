import { tauriCommands } from "@/lib/tauri";

/** 系统默认输出设备（setSinkId("") 恢复系统默认路由） */
export const DEFAULT_AUDIO_OUTPUT = "";

export interface AudioOutputDevice {
  deviceId: string;
  label: string;
}

/** WebView2/Chromium 才支持按设备路由；WebKitGTK（Linux）与 WKWebView（macOS）不支持 */
export function supportsAudioOutputSelection(): boolean {
  return typeof HTMLMediaElement !== "undefined"
    && "setSinkId" in HTMLMediaElement.prototype
    && typeof navigator !== "undefined"
    && !!navigator.mediaDevices?.enumerateDevices;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 读取系统音频输出设备。
 *
 * Chromium 只在 origin 获得麦克风权限后才返回 `audiooutput` 的真实 deviceId/label，
 * 因此先让 Rust 侧给 WebView2 profile 静默写入权限（不采集、无权限弹框）；
 * 权限写入是异步的，首次调用后轮询几次等待设备名出现。
 */
export async function listAudioOutputDevices(): Promise<AudioOutputDevice[]> {
  if (!supportsAudioOutputSelection()) return [];

  await tauriCommands.audio.prepareDeviceList().catch(() => {});

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const outputs = all
      .filter((device) => device.kind === "audiooutput" && device.deviceId && device.deviceId !== "default")
      .map((device) => ({ deviceId: device.deviceId, label: device.label }));
    // 没有 label 说明权限尚未生效（只剩一个空的默认设备），继续等；
    // 设备数量为 0 时也重试，避免权限刚写入时枚举结果为空。
    if (outputs.length > 0 && outputs.every((device) => device.label)) return outputs;
    await sleep(150);
  }

  return [];
}

/**
 * 把媒体元素切到指定输出设备；失败时回退系统默认。
 * 返回是否成功切到目标设备（回退也算 false）。
 */
export async function applyAudioOutputDevice(
  element: HTMLMediaElement,
  deviceId: string
): Promise<boolean> {
  if (!("setSinkId" in element)) return false;
  const wasPlaying = !element.paused;
  try {
    await element.setSinkId(deviceId || DEFAULT_AUDIO_OUTPUT);
    return true;
  } catch (error) {
    console.warn(`[audio] 切换输出设备失败（${deviceId || "系统默认"}）`, error);
    if (deviceId) {
      // 设备被拔掉或不可用时不要静音：回退到系统默认设备继续播放。
      // 个别内核在 sink 失效时会把元素停在暂停态，切换前正在播放的话补一次 play()
      try {
        await element.setSinkId(DEFAULT_AUDIO_OUTPUT);
        if (wasPlaying && element.paused) {
          await element.play().catch(() => {});
        }
      } catch {
        // 浏览器不支持或上下文已销毁，忽略
      }
    }
    return false;
  }
}

/**
 * 设备拓扑快照：用于判断一次 devicechange 是否意味着
 * 「当前正在使用的输出设备被拔出」。
 */
export interface AudioOutputTopology {
  /** 真实输出设备（不含 Chromium 的 default 伪设备） */
  deviceIds: string[];
  /** 真实输出设备的物理分组 ID（用于判断默认设备是否还在） */
  groups: string[];
  /** 系统默认输出对应的物理设备标识；空字符串 = 无法识别（例如尚未授权） */
  defaultKey: string;
}

export async function readAudioOutputTopology(): Promise<AudioOutputTopology | null> {
  if (!supportsAudioOutputSelection()) return null;
  const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  const outputs = all.filter((device) => device.kind === "audiooutput");
  const defaultEntry = outputs.find((device) => device.deviceId === "default");
  const physical = outputs.filter((device) => device.deviceId && device.deviceId !== "default");
  return {
    deviceIds: physical.map((device) => device.deviceId),
    groups: physical.map((device) => device.groupId).filter(Boolean),
    // default 伪设备的 groupId 指向当前默认输出的物理设备；拿不到时退回 label
    defaultKey: defaultEntry?.groupId || defaultEntry?.label || "",
  };
}

/**
 * 对比变化前后的设备拓扑：
 * - 选中了具体设备：该设备从「存在」变成「不存在」；
 * - 使用系统默认：之前默认输出对应的物理设备已经不在设备列表里。
 *   （仅切换默认设备、原设备仍然存在时不视为断开，例如新插入耳机）
 * 首次快照缺失、无法识别默认设备或当前枚举失败时返回 false（不误断开）。
 */
export function outputDeviceLost(
  previous: AudioOutputTopology | null,
  current: AudioOutputTopology | null,
  selectedDeviceId: string
): boolean {
  if (!previous || !current) return false;
  if (selectedDeviceId) {
    return previous.deviceIds.includes(selectedDeviceId)
      && !current.deviceIds.includes(selectedDeviceId);
  }
  return Boolean(
    previous.defaultKey
    && current.groups.length > 0
    && !current.groups.includes(previous.defaultKey)
  );
}
