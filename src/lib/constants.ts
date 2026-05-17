import { getVersion } from "@tauri-apps/api/app";

export const APP_NAME = "BiliDanmu";

let cachedVersion: string | null = null;

export async function getAppVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  cachedVersion = await getVersion();
  return cachedVersion;
}
