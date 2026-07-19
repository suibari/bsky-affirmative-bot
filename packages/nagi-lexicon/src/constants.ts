export const NAGI = {
  post: "com.suibari.nagi.post",
  reaction: "com.suibari.nagi.reaction",
  profile: "com.suibari.nagi.profile",
  getTimeline: "com.suibari.nagi.getTimeline",
  getAffirmation: "com.suibari.nagi.getAffirmation",
  getThread: "com.suibari.nagi.getThread",
  getProfile: "com.suibari.nagi.getProfile",
  getNotifications: "com.suibari.nagi.getNotifications",
  updateSeen: "com.suibari.nagi.updateSeen",
  translatePost: "com.suibari.nagi.translatePost",
  deleteAccountData: "com.suibari.nagi.deleteAccountData",
} as const;

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

export const NAGI_COLLECTIONS = [NAGI.post, NAGI.reaction, NAGI.profile] as const;
export const NAGI_APPVIEW_DID = process.env.NAGI_APPVIEW_DID ?? "did:web:nagi-api.suibari.com";
export const NAGI_APPVIEW_SERVICE_ID = "nagi_appview";
export const NAGI_APPVIEW_AUD = `${NAGI_APPVIEW_DID}#${NAGI_APPVIEW_SERVICE_ID}`;
export const NAGI_BOT_DID = process.env.NAGI_BOT_DID ?? "";
export const NAGI_AFFIRMATION_THRESHOLD = Number(
  process.env.NAGI_AFFIRMATION_THRESHOLD ?? process.env.NAGI_TREND_THRESHOLD ?? 86,
);
export const NAGI_OAUTH_SCOPE = [
  "atproto",
  ...NAGI_COLLECTIONS.map((nsid) => `repo:${nsid}`),
  "blob:image/*",
  ...[
    NAGI.getTimeline,
    NAGI.getAffirmation,
    NAGI.getThread,
    NAGI.getProfile,
    NAGI.getNotifications,
    NAGI.updateSeen,
    NAGI.deleteAccountData,
  ].map((nsid) => `rpc:${nsid}?aud=${NAGI_APPVIEW_AUD.replace("#", "%23")}`),
].join(" ");
