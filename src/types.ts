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
};

export interface ImageRef {
  image_url: string;
  mimeType: string;
}

export type GeminiResponseResult = string | {
  text: string;
  imageBlob?: BlobRef;
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
