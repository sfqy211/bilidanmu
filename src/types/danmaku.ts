export interface Medal {
  name: string;
  level: number;
  /** 是否点亮（1=点亮, 0=熄灭） */
  isLight: number;
}

export type DanmakuMessageType =
  | "danmaku"
  | "gift"
  | "superChat"
  | "guard"
  | "entry"
  | "like"
  | "system";

export interface LikeCountUpdatePayload {
  roomId: number;
  clickCount: number;
}

export interface InlineEmoticon {
  count?: number;
  descript?: string;
  emoji?: string;
  emoticonId?: number;
  emoticonUnique?: string;
  height?: number;
  url: string;
  width?: number;
}

export interface BigEmoticonOptions {
  emoticonUnique: string;
  url: string;
  width: number;
  height: number;
  isDynamic?: number;
  bulgeDisplay?: number;
  inPlayerArea?: number;
}

export interface DanmakuMessage {
  id: string;
  roomId: number;
  type: DanmakuMessageType;
  username: string;
  content: string;
  timestamp: number;
  avatar?: string;
  medal?: Medal;
  wealthLevel?: number;
  price?: number;
  giftName?: string;
  count?: number;
  uid?: number;
  color?: number;
  guardLevel?: number;
  isAdmin?: boolean;
  dmType?: number;
  backgroundColor?: string;
  backgroundBottomColor?: string;
  backgroundPriceColor?: string;
  messageFontColor?: string;
  backgroundImage?: string;
  emots?: Record<string, InlineEmoticon>;
  emoticonOptions?: BigEmoticonOptions;
}
