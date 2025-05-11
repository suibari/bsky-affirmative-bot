import { BlobRef } from "@atproto/api";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Content, Type } from "@google/genai";

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

export type GeminiSchemaRecommendedSong = {
  type: Type.ARRAY;
  items: {
    type: Type.OBJECT;
    properties: {
      title: {
        type: Type.STRING;
      };
      artist: {
        type: Type.STRING;
      };
      comment: {
        type: Type.STRING;
      };
    };
    propertyOrdering: ["title", "artist", "comment"];
  }
}

export type GeminiRecommendation = [
  {
    title: string;
    artist: string;
    comment: string;
  }
]
