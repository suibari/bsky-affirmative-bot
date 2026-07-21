export type StrongRef = { uri: string; cid: string };
export type AspectRatio = { width: number; height: number };
export type BlobRef = {
  $type: "blob";
  ref: { $link: string };
  mimeType: string;
  size: number;
};
export type LinkFacetFeature = {
  $type: "app.bsky.richtext.facet#link";
  uri: string;
};
export type MentionFacetFeature = {
  $type: "app.bsky.richtext.facet#mention";
  did: string;
};
export type Facet = {
  index: { byteStart: number; byteEnd: number };
  features: Array<LinkFacetFeature | MentionFacetFeature | unknown>;
};
export type NagiImage = {
  image: BlobRef;
  alt: string;
  aspectRatio?: AspectRatio;
};
export type NagiLinkCard = {
  uri: string;
  title: string;
  description?: string;
  thumb?: BlobRef;
};
export type NagiPost = {
  $type: "com.suibari.nagi.post";
  text: string;
  facets?: Facet[];
  langs?: string[];
  createdAt: string;
  reply?: { root: StrongRef; parent: StrongRef };
  linkCards?: NagiLinkCard[];
  embed?:
    | { $type: "com.suibari.nagi.post#images"; images: NagiImage[] }
    | {
        $type: "com.suibari.nagi.post#quote";
        record: StrongRef;
        images?: NagiImage[];
      };
};
export type BluemojiRef = {
  uri: string;
  cid: string;
  name: string;
  alt?: string;
};
export type NagiReaction = {
  $type: "com.suibari.nagi.reaction";
  subject: StrongRef;
  emoji: string;
  bluemoji?: BluemojiRef;
  createdAt: string;
};
/** blue.moji.collection.item のうち Nagi が利用するラスタ形式（lottie は非対応）。 */
export type BluemojiFormats = {
  png_128?: string;
  webp_128?: string;
  gif_128?: string;
  apng_128?: string;
};
export type BluemojiItem = {
  $type: "blue.moji.collection.item";
  name: string;
  alt?: string;
  adultOnly?: boolean;
  fallbackText?: string;
  createdAt: string;
  formats: { $type: string } & Record<string, unknown>;
};
/** AppView が返すカスタム絵文字のビュー。url は blob プロキシへの相対パス。 */
export type EmojiView = {
  uri: string;
  cid: string;
  did: string;
  name: string;
  alt?: string;
  url: string;
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
  /** 超ポジティブLv（Blueskyと共通のカウンタ。100以上もそのまま返す）。0のときは付けない。 */
  superPositiveLevel?: number;
};
export type ReactionView = {
  emoji: string;
  bluemoji?: EmojiView;
  reactors: ActorView[];
  hasMoreReactors?: boolean;
  reactedByMe?: boolean;
  viewerReactionUri?: string;
};
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
  linkCards?: Array<{
    uri: string;
    title: string;
    description?: string;
    thumb?: string;
  }>;
  quote?: PostView;
  reactions: ReactionView[];
  isBot: boolean;
  isAffirmation: boolean;
  deleted?: boolean;
};
export type BotReplyState = "pending" | "processing" | "posted" | "failed";
export type FeedItem = PostView & {
  replyParent?: PostView;
  botReply?: PostView;
  botReplyState?: BotReplyState;
};
export type Page<T> = {
  items: T[];
  cursor?: string;
  hasMore: boolean;
  botActor?: ActorView;
};
export type ProfileFeedFilter = "posts" | "replies" | "media" | "reactions";
export type ProfileDetail = ActorView & {
  postCount: number;
  firstPostAt?: string;
  joinedAt?: string;
};
export type ProfilePage = { profile: ProfileDetail; feed: Page<FeedItem> };
export type ThreadView = { post: PostView; replies: PostView[] };
export type NotificationView = {
  id: string;
  type: "reply" | "reaction" | "mention";
  actor: ActorView;
  post?: PostView;
  /** type が "reaction" のときの、押された絵文字。 */
  reaction?: { emoji: string; bluemoji?: EmojiView };
  subjectUri: string;
  reasonUri: string;
  createdAt: string;
  readAt?: string;
};
export type SearchActorsResult = { actors: ActorView[] };
export type SearchEmojisResult = { emojis: EmojiView[]; cursor?: string };
export type GetEmojiResult = { emoji: EmojiView };
export type DeleteAccountDataResult = { success: true };
