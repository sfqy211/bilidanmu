import { getVersion } from "@tauri-apps/api/app";

export const APP_NAME = "BiliDanmu";

/** 匿名模式的特殊账号 ID */
export const ANONYMOUS_ACCOUNT_ID = "anonymous";

let cachedVersion: string | null = null;

export async function getAppVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  cachedVersion = await getVersion();
  return cachedVersion;
}
