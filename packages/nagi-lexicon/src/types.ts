export type StrongRef = { uri: string; cid: string };
export type AspectRatio = { width: number; height: number };
export type BlobRef = { $type: "blob"; ref: { $link: string }; mimeType: string; size: number };
export type Facet = { index: { byteStart: number; byteEnd: number }; features: unknown[] };
export type NagiImage = { image: BlobRef; alt: string; aspectRatio?: AspectRatio };
export type NagiPost = {
  $type: "com.suibari.nagi.post";
  text: string;
  facets?: Facet[];
  langs?: string[];
  createdAt: string;
  reply?: { root: StrongRef; parent: StrongRef };
  embed?:
    | { $type: "com.suibari.nagi.post#images"; images: NagiImage[] }
    | { $type: "com.suibari.nagi.post#quote"; record: StrongRef };
};
export type NagiReaction = {
  $type: "com.suibari.nagi.reaction";
  subject: StrongRef;
  emoji: string;
  createdAt: string;
};
export type NagiProfile = {
  $type: "com.suibari.nagi.profile";
  displayName: string;
  description?: string;
  avatar?: BlobRef;
  createdAt: string;
};
export type ActorView = {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  avatar?: string;
};
export type ReactionView = { emoji: string; count: number; reactedByMe?: boolean };
export type PostView = {
  uri: string;
  cid: string;
  author: ActorView;
  text: string;
  facets?: Facet[];
  langs?: string[];
  createdAt: string;
  indexedAt: string;
  reply?: { root: string; parent: string };
  images?: Array<{ url: string; alt: string; aspectRatio?: AspectRatio }>;
  quote?: PostView;
  reactions: ReactionView[];
  isBot: boolean;
  isTrend: boolean;
  deleted?: boolean;
};
export type Page<T> = { items: T[]; cursor?: string; hasMore: boolean };
export type NotificationView = {
  id: string;
  type: "reply" | "reaction";
  actor: ActorView;
  subjectUri: string;
  reasonUri: string;
  createdAt: string;
  readAt?: string;
};
