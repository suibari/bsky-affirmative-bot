import { BlobRef } from "@atproto/api";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Content } from "@google/genai";

export type UserInfoGemini = {
  follower: ProfileView;
  langStr?: string;
  posts?: string[];
  history?: Content[];
  image_url?: string;
  image_mimeType?: string;
};

export type GeminiResponseResult = string | {
  text: string;
  imageBlob?: BlobRef;
};

