export const NAGI = {
  post: "com.suibari.nagi.post",
  reaction: "com.suibari.nagi.reaction",
  profile: "com.suibari.nagi.profile",
  getTimeline: "com.suibari.nagi.getTimeline",
  getTrend: "com.suibari.nagi.getTrend",
  getThread: "com.suibari.nagi.getThread",
  getProfile: "com.suibari.nagi.getProfile",
  getNotifications: "com.suibari.nagi.getNotifications",
  updateSeen: "com.suibari.nagi.updateSeen",
  translatePost: "com.suibari.nagi.translatePost",
} as const;

export const NAGI_COLLECTIONS = [NAGI.post, NAGI.reaction, NAGI.profile] as const;
export const NAGI_APPVIEW_DID = process.env.NAGI_APPVIEW_DID ?? "did:web:nagi-api.suibari.com";
export const NAGI_APPVIEW_SERVICE_ID = "nagi_appview";
export const NAGI_APPVIEW_AUD = `${NAGI_APPVIEW_DID}#${NAGI_APPVIEW_SERVICE_ID}`;
export const NAGI_BOT_DID = process.env.NAGI_BOT_DID ?? "";
export const NAGI_TREND_THRESHOLD = Number(process.env.NAGI_TREND_THRESHOLD ?? 86);
export const NAGI_OAUTH_SCOPE = [
  "atproto",
  ...NAGI_COLLECTIONS.map((nsid) => `repo:${nsid}`),
  "blob:image/*",
  ...[
    NAGI.getTimeline,
    NAGI.getTrend,
    NAGI.getThread,
    NAGI.getProfile,
    NAGI.getNotifications,
    NAGI.updateSeen,
    NAGI.translatePost,
  ].map((nsid) => `rpc:${nsid}?aud=${NAGI_APPVIEW_AUD.replace("#", "%23")}`),
].join(" ");
