import { BlobRef } from "@atproto/api";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Content, Type } from "@google/genai";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";

export type WhatDayMap = {
  [month: string]: {
    [date: string]: string[];
  };
};

export type UserInfoGemini = {
  follower: ProfileView;
  langStr?: string;
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
  parent?: Record
  grandParent?: Record
  root?: Record
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
