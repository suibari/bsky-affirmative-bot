import { BlobRef } from "@atproto/api";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";

export type UserInfoGemini = {
  follower: ProfileView;
  langStr?: string;
  posts?: string[];
  history?: HistoryGemini[];
  image_url?: string;
  image_mimeType?: string;
};

export type GeminiResponseResult = string | {
  text: string;
  imageBlob?: BlobRef;
};

export type HistoryGemini = {
  role: "user" | "model";
  parts: [{text: string}];
}
