export const NAGI = {
  post: "com.suibari.nagi.post",
  reaction: "com.suibari.nagi.reaction",
  profile: "com.suibari.nagi.profile",
  /** botたんが書くユーザーの日記。書き手は bot のみなのでユーザーの書き込みスコープには含めない。 */
  diary: "com.suibari.nagi.diary",
  getTimeline: "com.suibari.nagi.getTimeline",
  getAffirmation: "com.suibari.nagi.getAffirmation",
  getThread: "com.suibari.nagi.getThread",
  getProfile: "com.suibari.nagi.getProfile",
  searchActors: "com.suibari.nagi.searchActors",
  getNotifications: "com.suibari.nagi.getNotifications",
  getUnreadCount: "com.suibari.nagi.getUnreadCount",
  updateSeen: "com.suibari.nagi.updateSeen",
  translatePost: "com.suibari.nagi.translatePost",
  getLinkMetadata: "com.suibari.nagi.getLinkMetadata",
  getLinkThumbnail: "com.suibari.nagi.getLinkThumbnail",
  deleteAccountData: "com.suibari.nagi.deleteAccountData",
  searchEmojis: "com.suibari.nagi.searchEmojis",
  getEmoji: "com.suibari.nagi.getEmoji",
  getDiaries: "com.suibari.nagi.getDiaries",
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
  BLUEMOJI_ITEM,
] as const;
/**
 * jetstream で購読するコレクション。
 * 日記は bot だけが書くのでユーザーの書き込みスコープ（NAGI_COLLECTIONS）には無いが、
 * AppView は取り込む必要があるためここにだけ足す。
 */
export const NAGI_INGEST_COLLECTIONS = [
  ...NAGI_COLLECTIONS,
  NAGI.diary,
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
 * Nagi の OAuth スコープ（真実源はこの1箇所）。repo/rpc 権限は permission set(appviewAccess) に
 * 集約し、公開済み lexicon 側を真実源にする。blob は permission set に入れられない仕様なので
 * `blob:image/*` は直接スコープで残す（account/identity と同様、クライアントが直接要求する種別）。
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
].join(" ");
