import { BlobRef } from "@atproto/api";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Content, Type } from "@google/genai";
import { Record as PostRecord } from "@atproto/api/dist/client/types/app/bsky/feed/post";

interface LanguageInfo {
  code: string;
  name: LanguageName;
}

export const languageData: LanguageInfo[] = [
  { code: "en", name: "English" },
  { code: "ja", name: "日本語" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "es", name: "Spanish" },
  { code: "zh", name: "Chinese" },
  { code: "ko", name: "Korean" },
  { code: "it", name: "Italian" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
  { code: "pt", name: "Portuguese" },
];

export type LanguageName =
  | "English"
  | "日本語"
  | "French"
  | "German"
  | "Spanish"
  | "Chinese"
  | "Korean"
  | "Italian"
  | "Russian"
  | "Arabic"
  | "Portuguese";

export const localeToTimezone: Record<string, string> = {
  "ja": "Asia/Tokyo",
  "en": "America/New_York",
  "en-US": "America/New_York",
  "en-GB": "Europe/London",
  "fr": "Europe/Paris",
  "de": "Europe/Berlin",
  "es": "Europe/Madrid",
  "zh-CN": "Asia/Shanghai",
  "zh-TW": "Asia/Taipei",
  "ko": "Asia/Seoul",
  "it": "Europe/Rome",
  "ru": "Europe/Moscow",
  "ar": "Asia/Riyadh",
  "pt-BR": "America/Sao_Paulo",
  "pt-PT": "Europe/Lisbon",
};

export type LangMap = {
  [langCode: string]: {
    name: LanguageName;
  };
};

export type WhatDayMap = {
  [month: string]: {
    [date: string]: string[];
  };
};

export type UserInfoGemini = {
  follower: ProfileView;
  langStr?: LanguageName;
  posts?: string[];
  likedByFollower?: string[];
  history?: Content[];
  image?: ImageRef[];
  anniversary?: Holiday[];
};

export interface ImageRef {
  image_url: string;
  mimeType: string;
}

export type GeminiResponseResult = string | {
  text: string;
  imageBlob?: BlobRef;
  embedTo?: {
    uri: string;
    cid: string;
  }
};

export type GeminiScore = {
  comment: string;
  score: number;
}

export interface ThreadInfo {
  parent?: PostRecord
  grandParent?: PostRecord
  root?: PostRecord
}

export type Holiday = {
  id: string;
  names: { ja: string; en: string };
  rule:
    | { type: "fixed"; month: number; day: number }
    | { type: "nth-weekday"; month: number; week: number; weekday: number } // weekday: 0=Sun..6=Sat
    | { type: "easter"; calendar: "western" | "orthodox" };
  regions?: string[];
}
