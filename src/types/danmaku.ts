export type DanmakuMessageType =
  | "danmaku"
  | "gift"
  | "superChat"
  | "entry"
  | "system";

export interface DanmakuMessage {
  id: string;
  roomId: number;
  type: DanmakuMessageType;
  username: string;
  content: string;
  timestamp: number;
  avatar?: string;
  medal?: string;
  price?: number;
  giftName?: string;
  count?: number;
}
