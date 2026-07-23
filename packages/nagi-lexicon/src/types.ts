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
  /**
   * こっそりモード。スレッドの公開範囲はルート投稿だけが所有するため、
   * 新しい返信レコードには設定しない。
   */
  kossori?: boolean;
  /** 所属チャンネル（com.suibari.nagi.channel）への参照。返信は親の channel を継承する。 */
  channel?: StrongRef;
  /** true なら CH 限定＝グローバルTL非表示（kossori と同じ除外扱い）。 */
  channelOnly?: boolean;
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
/** ユーザーが作るチャンネル。作成者の PDS に置くレコード。 */
export type NagiChannel = {
  $type: "com.suibari.nagi.channel";
  name: string;
  description?: string;
  banner?: BlobRef;
  createdAt: string;
};
/** AppView が返すチャンネルのビュー。banner は blob プロキシへの相対パス。 */
export type ChannelView = {
  uri: string;
  cid: string;
  did: string;
  name: string;
  description?: string;
  banner?: string;
  createdAt: string;
  indexedAt: string;
  /** 最新投稿時刻（活動順の並べ替え・過疎判定に使う）。投稿ゼロなら付けない。 */
  lastPostAt?: string;
};
export type NagiNews = {
  $type: "com.suibari.nagi.news";
  articleId: string;
  url: string;
  titleJa: string;
  sourceName?: string;
  sourceUrl?: string;
  publishedAt?: string;
  langs: string[];
  createdAt: string;
};
export type NewsView = {
  uri: string;
  cid: string;
  articleId: string;
  url: string;
  title: string;
  sourceName?: string;
  sourceUrl?: string;
  publishedAt?: string;
  botComment: string;
  lang: "ja" | "en";
  createdAt: string;
  indexedAt: string;
  unavailable?: boolean;
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
/**
 * botたんが書くユーザーの日記。bot のリポジトリに置く。
 * rkey は `${subject の ":" を "_" にしたもの}-${date}` で決定論的にし、putRecord で冪等にする。
 */
export type NagiDiary = {
  $type: "com.suibari.nagi.diary";
  /** 日記の対象ユーザーの DID。 */
  subject: string;
  /** ユーザーのローカル日付 "YYYY-MM-DD"。 */
  date: string;
  text: string;
  /** その日の称号。 */
  titleJa?: string;
  titleEn?: string;
  langs?: string[];
  createdAt: string;
};
export type DiaryView = {
  uri: string;
  cid: string;
  subject: string;
  date: string;
  text: string;
  titleJa?: string;
  titleEn?: string;
  langs?: string[];
  createdAt: string;
  indexedAt: string;
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
  /** botたん本人か。バッジ表示はアクター単位で判定する（PostView.isBot は同じ式の派生）。 */
  isBot?: boolean;
  /** 超ポジティブLv（Blueskyと共通のカウンタ。100以上もそのまま返す）。0のときは付けない。 */
  superPositiveLevel?: number;
  /**
   * 現在の称号（Blueskyと共通の followers.current_title_*）。
   * Bluesky のラベルは24時間で失効するが、こちらは次の日記/占いが上書きするまで維持される。
   * 表示側が UI 言語で出し分けるので両方返す。
   */
  currentTitle?: { ja: string; en: string };
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
  reply?: { root: StrongRef; parent: StrongRef };
  images?: Array<{ url: string; alt: string; aspectRatio?: AspectRatio }>;
  linkCards?: Array<{
    uri: string;
    title: string;
    description?: string;
    thumb?: string;
  }>;
  quote?:
    | { kind: "post"; post: PostView }
    | { kind: "news"; news: NewsView };
  reactions: ReactionView[];
  isBot: boolean;
  isAffirmation: boolean;
  /** このレコード自身のこっそり値。新規データではスレッドルートだけが持つ。 */
  kossori?: boolean;
  /** ルート投稿から解決した、スレッド全体の有効なこっそり状態。 */
  threadKossori?: boolean;
  /** 所属チャンネル（あれば）。バッジ表示・返信時の継承元に使う。 */
  channel?: { uri: string; cid: string; name?: string };
  /** CH 限定投稿（グローバル非表示）か。 */
  channelOnly?: boolean;
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
  type: "reply" | "reaction" | "mention" | "diary";
  actor: ActorView;
  post?: PostView;
  /** type が "diary" のときの日記本体。post は付かない。 */
  diary?: DiaryView;
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
