import type { CharacterData } from "@/db/schema";

export type GameInfo = {
  id: number;
  title: string;
  masterProfile: string;
  files: { name: string; chars: number }[];
  rulesChars: number;
  pageCount?: number;
  systemName?: string;
  systemSummary?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  note?: string;
  dice?: {
    notation: string;
    total: number;
    detail: string;
    reason: string;
    rolls?: number[];
    by?: "gm" | "player";
    animate?: boolean;
  };
};

export type { CharacterData };
