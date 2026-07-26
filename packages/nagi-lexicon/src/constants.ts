export const NAGI = {
  post: "com.suibari.nagi.post",
  reaction: "com.suibari.nagi.reaction",
  profile: "com.suibari.nagi.profile",
  /** ユーザーが curate する、任意 Atmosphere アプリへの連携宣言リスト（プロフィール下部に表示）。 */
  appLinks: "com.suibari.nagi.appLinks",
  /** botたんが書くユーザーの日記。書き手は bot のみなのでユーザーの書き込みスコープには含めない。 */
  diary: "com.suibari.nagi.diary",
  /** botたん（将来はユーザーも）がPDSへ保存する、タイムライン非表示のニュースレコード。 */
  news: "com.suibari.nagi.news",
  /** ユーザーが作る同好の集まり（チャンネル）。作成者のPDSに置く。post.channel から参照する。 */
  channel: "com.suibari.nagi.channel",
  getTimeline: "com.suibari.nagi.getTimeline",
  getAffirmation: "com.suibari.nagi.getAffirmation",
  getThread: "com.suibari.nagi.getThread",
  getProfile: "com.suibari.nagi.getProfile",
  searchActors: "com.suibari.nagi.searchActors",
  getNotifications: "com.suibari.nagi.getNotifications",
  getUnreadCount: "com.suibari.nagi.getUnreadCount",
  updateSeen: "com.suibari.nagi.updateSeen",
  registerPushSubscription: "com.suibari.nagi.registerPushSubscription",
  deletePushSubscription: "com.suibari.nagi.deletePushSubscription",
  translatePost: "com.suibari.nagi.translatePost",
  getLinkMetadata: "com.suibari.nagi.getLinkMetadata",
  getLinkThumbnail: "com.suibari.nagi.getLinkThumbnail",
  deleteAccountData: "com.suibari.nagi.deleteAccountData",
  searchEmojis: "com.suibari.nagi.searchEmojis",
  getEmoji: "com.suibari.nagi.getEmoji",
  getDiaries: "com.suibari.nagi.getDiaries",
  getPositiveNews: "com.suibari.nagi.getPositiveNews",
  resolveLexicon: "com.suibari.nagi.resolveLexicon",
  getAppIcon: "com.suibari.nagi.getAppIcon",
  getChannels: "com.suibari.nagi.getChannels",
  getChannel: "com.suibari.nagi.getChannel",
  getChannelTimeline: "com.suibari.nagi.getChannelTimeline",
  /** タグ検索/自由文検索。公開コンテンツなのでクライアントは AppView 直読み（getChannelTimeline と同方針）。 */
  searchPosts: "com.suibari.nagi.searchPosts",
  /** チャンネルの自由文検索（意味検索+語彙）。 */
  searchChannels: "com.suibari.nagi.searchChannels",
  /** ニュースの自由文検索（意味検索+語彙）。 */
  searchNews: "com.suibari.nagi.searchNews",
  /**
   * 自分のミュート一覧。ミュートは他ユーザーに公開してはならないので PDS レコードにはせず
   * AppView だけが持ち、認証した本人にしか返さない（requiredServiceAuth）。
   */
  getMutes: "com.suibari.nagi.getMutes",
  /** ユーザー/チャンネルのミュート設定・解除。 */
  setMute: "com.suibari.nagi.setMute",
  /**
   * 全肯定カードのコレクション。所持は公開情報なのでクライアントは AppView 直読みでも取れる
   * （getChannelTimeline と同方針）。自分を指定したときだけ drawStatus が付く。
   */
  getCards: "com.suibari.nagi.getCards",
  /**
   * カードを1枚引く（1日1回）。抽選結果が改竄されては困るので AppView が権威を持ち、
   * PDS レコードにはしない。要認証。
   */
  drawCard: "com.suibari.nagi.drawCard",
} as const;

/** Bluemoji (moji.blue) の絵文字定義レコード。カスタム絵文字はユーザー自身のPDSに置く。 */
export const BLUEMOJI_ITEM = "blue.moji.collection.item";

export const NAGI_LANGUAGES = [
  { code: "ar", name: "Arabic" },
  { code: "bn", name: "Bengali" },
  { code: "bg", name: "Bulgarian" },
  { code: "zh", name: "Chinese" },
  { code: "hr", name: "Croatian" },
  { code: "cs", name: "Czech" },
  { code: "da", name: "Danish" },
  { code: "nl", name: "Dutch" },
  { code: "en", name: "English" },
  { code: "et", name: "Estonian" },
  { code: "fi", name: "Finnish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "el", name: "Greek" },
  { code: "he", name: "Hebrew" },
  { code: "hi", name: "Hindi" },
  { code: "hu", name: "Hungarian" },
  { code: "id", name: "Indonesian" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "Korean" },
  { code: "lv", name: "Latvian" },
  { code: "lt", name: "Lithuanian" },
  { code: "no", name: "Norwegian" },
  { code: "pl", name: "Polish" },
  { code: "pt", name: "Portuguese" },
  { code: "ro", name: "Romanian" },
  { code: "ru", name: "Russian" },
  { code: "sr", name: "Serbian" },
  { code: "sk", name: "Slovak" },
  { code: "sl", name: "Slovenian" },
  { code: "es", name: "Spanish" },
  { code: "sw", name: "Swahili" },
  { code: "sv", name: "Swedish" },
  { code: "th", name: "Thai" },
  { code: "tr", name: "Turkish" },
  { code: "uk", name: "Ukrainian" },
  { code: "vi", name: "Vietnamese" },
] as const;

export const NAGI_COLLECTIONS = [
  NAGI.post,
  NAGI.reaction,
  NAGI.profile,
  NAGI.appLinks,
  NAGI.channel,
  BLUEMOJI_ITEM,
] as const;
/**
 * jetstream で購読するコレクション。
 * 日記は bot だけが書くのでユーザーの書き込みスコープ（NAGI_COLLECTIONS）には無いが、
 * AppView は取り込む必要があるためここにだけ足す。
 * 逆に appLinks はユーザー書き込み可能（NAGI_COLLECTIONS に含む）だが、表示はクライアント直読み
 * のため AppView では取り込まない。よって NAGI_COLLECTIONS を spread せず明示列挙する。
 */
export const NAGI_INGEST_COLLECTIONS = [
  NAGI.post,
  NAGI.reaction,
  NAGI.profile,
  BLUEMOJI_ITEM,
  NAGI.diary,
  NAGI.news,
  NAGI.channel,
] as const;
export const NAGI_APPVIEW_DID =
  process.env.NAGI_APPVIEW_DID ?? "did:web:nagi-api.suibari.com";
export const NAGI_APPVIEW_SERVICE_ID = "nagi_appview";
export const NAGI_APPVIEW_AUD = `${NAGI_APPVIEW_DID}#${NAGI_APPVIEW_SERVICE_ID}`;
export const NAGI_BOT_DID = process.env.NAGI_BOT_DID ?? "";
export const NAGI_AFFIRMATION_THRESHOLD = Number(
  process.env.NAGI_AFFIRMATION_THRESHOLD ??
    process.env.NAGI_TREND_THRESHOLD ??
    86,
);
/** permission set の NSID。定義は lexicons/com/suibari/nagi/appviewAccess.json。 */
export const NAGI_PERMISSION_SET = "com.suibari.nagi.appviewAccess";

/**
 * Nagi の OAuth スコープ（真実源はこの1箇所）。Nagi namespace の repo/rpc 権限は permission
 * set(appviewAccess) に集約し、公開済み lexicon 側を真実源にする。blob と別 namespace の
 * Bluemoji repo 権限は permission set に入れられないため、直接スコープで残す。
 * client.ts / client-metadata.json はこのバンドル参照形を使う。
 *
 * rpc の aud は permission set 側で `"aud": "*"`（wildcard）にハードコードしている。fragment 固定だと
 * proxy 時に service fragment を落として bare aud で照合する PDS（Spring 2026 以前挙動）で
 * "Missing required scope" になるため。wildcard は新旧 PDS 双方の照合にマッチする（cf. Skyblur）。
 * よって include には aud パラメータを付けない（付けると inheritAud と競合しうる）。
 *
 * 変更時の注意: バンドルの中身（repo/rpc）は appviewAccess.json 側を編集し `pnpm lex:publish`
 * （= goat lex publish）で再公開する。反映まで JSON 変更だけでは効かない。
 * スコープ文字列そのものを変える場合は全ユーザーに再同意が発生する。cf. [[atproto-roadmap-2026]]
 */
export const NAGI_OAUTH_SCOPE = [
  "atproto",
  "blob:image/*",
  `include:${NAGI_PERMISSION_SET}`,
  `repo:${BLUEMOJI_ITEM}`,
].join(" ");

/**
 * オプトイン時にだけ追加で要求するスコープ。通常のサインインでは付けない。
 *
 * どちらも別 namespace なので appviewAccess(permission set) には入れられず、直接スコープで持つ。
 * standard.site 側にも site.standard.authFull という permission set があるが、
 * subscription / recommend まで含む過剰な束なので採らない。
 * Nagi は記事の作成・編集・削除を投稿に追従させるため、standard.site 側は action を絞らない。
 */
export const NAGI_CROSSPOST_SCOPE = "repo:app.bsky.feed.post?action=create";
export const NAGI_STANDARD_SITE_SCOPES = [
  "repo:site.standard.publication",
  "repo:site.standard.document",
];

/** client-metadata.json に宣言する最大集合（実際に要求するのはオプトインの分だけ）。 */
export const NAGI_OAUTH_SCOPE_FULL = [
  NAGI_OAUTH_SCOPE,
  NAGI_CROSSPOST_SCOPE,
  ...NAGI_STANDARD_SITE_SCOPES,
].join(" ");
