export type SearchRoomMode = "name" | "roomId" | "link" | "uid";

export interface Account {
  id: string;
  uid: number;
  username: string;
  avatar?: string;
  cookie: string;
  expiresAt?: string;
}

export interface Credential {
  accountId: string;
  uid: number;
  username: string;
  avatar?: string;
  cookie: string;
  biliJct?: string;
}

export interface LoginStatus {
  isLoggedIn: boolean;
  account?: Account;
}

export interface Room {
  id: string;
  roomId: number;
  uid?: number;
  title: string;
  uname: string;
  cover?: string;
  isLive: boolean;
  online?: number;
}

export interface RoomInfo extends Room {
  areaName?: string;
  parentAreaName?: string;
  description?: string;
}

export interface SearchRoomResult {
  roomId: number;
  uid?: number;
  uname: string;
  title: string;
  cover?: string;
  isLive: boolean;
}

export interface AIModel {
  id: string;
  endpoint: string;
  modelName: string;
  notes?: string;
  isCurrent?: boolean;
}

export interface AIModelInput {
  endpoint: string;
  apiKey: string;
  modelName: string;
  notes?: string;
}

export interface TestResult {
  success: boolean;
  latencyMs?: number;
  message?: string;
}

export interface Settings {
  sendInterval: { min: number; max: number };
  rateLimit: { maxPerWindow: number; windowSec: number };
  riskControl: {
    randomInterval: boolean;
    jitter: boolean;
    autoPauseOnMute: boolean;
    appendRandomSuffix: boolean;
  };
  receive: {
    autoConnect: boolean;
    autoReconnect: boolean;
    reconnectInterval: number;
    maxReconnectInterval: number;
  };
  appearance: {
    theme: "light" | "dark" | "system";
    fontSize: number;
    showMedal: boolean;
    showLevel: boolean;
  };
  notification: {
    muteAlert: boolean;
    cookieExpiry: boolean;
    sendSuccess: boolean;
    scAlert: boolean;
  };
}
