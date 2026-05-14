import type { AIModel, Account, Room, Settings } from "@/types/bilibili";

export interface AppConfig {
  accounts: Account[];
  rooms: Room[];
  models: AIModel[];
  settings: Settings;
}
