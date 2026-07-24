import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import {
  optionalServiceAuth,
  requiredServiceAuth,
} from "../auth/serviceAuth.js";
import { getTimeline } from "../queries/timeline.js";
import {
  getChannel,
  getChannelTimeline,
  getChannels,
} from "../queries/channels.js";
import { getActorProfile, getReactedFeed } from "../queries/profile.js";
import { searchActors } from "../queries/actors.js";
import { getThread } from "../queries/thread.js";
import {
  getNotifications,
  getUnreadCount,
  updateSeen,
} from "../queries/notifications.js";
import { getDiaries } from "../queries/diaries.js";
import { getPositiveNews } from "../queries/positiveNews.js";
import {
  deleteSubscription,
  upsertSubscription,
} from "../queries/pushSubscriptions.js";
import { translatePost } from "../services/translation.js";
import { ApiError } from "../middleware/errors.js";
import { deleteAccountData } from "../services/deleteAccountData.js";
import {
  getAppIcon,
  getLinkMetadata,
  getLinkThumbnail,
} from "../services/linkMetadata.js";
import { getEmoji, searchEmojis } from "../services/emoji.js";
import { resolveLexicon } from "../queries/resolveLexicon.js";
import { config } from "../config.js";
export const xrpc = Router();
const limit = (value: unknown) =>
  Math.min(100, Math.max(1, Number(value ?? 50) || 50));
for (const [nsid, affirmation] of [
  [NAGI.getTimeline, false],
  [NAGI.getAffirmation, true],
] as const)
  xrpc.get(`/${nsid}`, optionalServiceAuth(nsid), async (req, res, next) => {
    try {
      const data = await getTimeline({
        limit: limit(req.query.limit),
        cursor: String(req.query.cursor ?? "") || undefined,
        viewerDid: req.viewerDid,
        affirmation,
      });
      res
        .set(
          "Cache-Control",
          req.viewerDid ? "private, no-store" : "public, max-age=15",
        )
        .json(data);
    } catch (e) {
      next(e);
    }
  });
xrpc.get(
  `/${NAGI.getThread}`,
  optionalServiceAuth(NAGI.getThread),
  async (req, res, next) => {
    try {
      res
        .set(
          "Cache-Control",
          req.viewerDid ? "private, no-store" : "public, max-age=15",
        )
        .json(await getThread(String(req.query.uri ?? ""), req.viewerDid));
    } catch (e) {
      next(e);
    }
  },
);
xrpc.get(
  `/${NAGI.getProfile}`,
  optionalServiceAuth(NAGI.getProfile),
  async (req, res, next) => {
    try {
      const actor = String(req.query.actor ?? "");
      if (!actor)
        throw new ApiError(400, "invalid_request", "actor is required");
      const filter = String(req.query.filter ?? "posts");
      if (!["posts", "replies", "media", "reactions"].includes(filter))
        throw new ApiError(400, "invalid_request", "Invalid filter");
      const cursor = String(req.query.cursor ?? "") || undefined;
      const lang = String(req.query.lang ?? "ja");
      if (lang !== "ja" && lang !== "en")
        throw new ApiError(400, "invalid_request", "lang must be ja or en");
      const [profile, feed] = await Promise.all([
        getActorProfile(actor, lang),
        filter === "reactions"
          ? getReactedFeed({
              actorDid: actor,
              limit: limit(req.query.limit),
              cursor,
              viewerDid: req.viewerDid,
              lang,
            })
          : getTimeline({
              limit: limit(req.query.limit),
              cursor,
              actorDid: actor,
              viewerDid: req.viewerDid,
              filter: filter as "posts" | "replies" | "media",
            }),
      ]);
      res
        .set(
          "Cache-Control",
          req.viewerDid ? "private, no-store" : "public, max-age=15",
        )
        .json({ profile, feed });
    } catch (e) {
      next(e);
    }
  },
);
xrpc.get(
  `/${NAGI.getChannels}`,
  optionalServiceAuth(NAGI.getChannels),
  async (req, res, next) => {
    try {
      res
        .set(
          "Cache-Control",
          req.viewerDid ? "private, no-store" : "public, max-age=15",
        )
        .json(
          await getChannels({
            limit: limit(req.query.limit),
            cursor: String(req.query.cursor ?? "") || undefined,
          }),
        );
    } catch (e) {
      next(e);
    }
  },
);
xrpc.get(
  `/${NAGI.getChannel}`,
  optionalServiceAuth(NAGI.getChannel),
  async (req, res, next) => {
    try {
      const uri = String(req.query.uri ?? "");
      if (!uri) throw new ApiError(400, "invalid_request", "uri is required");
      const channel = await getChannel(uri, req.viewerDid);
      if (!channel) throw new ApiError(404, "not_found", "Channel not found");
      res
        .set(
          "Cache-Control",
          req.viewerDid ? "private, no-store" : "public, max-age=15",
        )
        .json({ channel });
    } catch (e) {
      next(e);
    }
  },
);
xrpc.get(
  `/${NAGI.getChannelTimeline}`,
  optionalServiceAuth(NAGI.getChannelTimeline),
  async (req, res, next) => {
    try {
      const uri = String(req.query.uri ?? "");
      if (!uri) throw new ApiError(400, "invalid_request", "uri is required");
      res
        .set(
          "Cache-Control",
          req.viewerDid ? "private, no-store" : "public, max-age=15",
        )
        .json(
          await getChannelTimeline({
            uri,
            limit: limit(req.query.limit),
            cursor: String(req.query.cursor ?? "") || undefined,
            viewerDid: req.viewerDid,
          }),
        );
    } catch (e) {
      next(e);
    }
  },
);
xrpc.get(
  `/${NAGI.searchPosts}`,
  optionalServiceAuth(NAGI.searchPosts),
  async (req, res, next) => {
    try {
      const tag = String(req.query.tag ?? "")
        .trim()
        .toLowerCase();
      if (!tag) throw new ApiError(400, "invalid_request", "tag is required");
      res
        .set(
          "Cache-Control",
          req.viewerDid ? "private, no-store" : "public, max-age=15",
        )
        .json(
          await getTimeline({
            tag,
            limit: limit(req.query.limit),
            cursor: String(req.query.cursor ?? "") || undefined,
            viewerDid: req.viewerDid,
          }),
        );
    } catch (e) {
      next(e);
    }
  },
);
xrpc.get(
  `/${NAGI.searchEmojis}`,
  optionalServiceAuth(NAGI.searchEmojis),
  async (req, res, next) => {
    try {
      res.set("Cache-Control", "public, max-age=60").json(
        await searchEmojis({
          q: String(req.query.q ?? "") || undefined,
          repo: String(req.query.repo ?? "") || undefined,
          limit: limit(req.query.limit),
          cursor: String(req.query.cursor ?? "") || undefined,
        }),
      );
    } catch (e) {
      next(e);
    }
  },
);
xrpc.get(
  `/${NAGI.getEmoji}`,
  optionalServiceAuth(NAGI.getEmoji),
  async (req, res, next) => {
    try {
      res
        .set("Cache-Control", "public, max-age=60")
        .json(await getEmoji(String(req.query.uri ?? "")));
    } catch (e) {
      next(e);
    }
  },
);
// 任意アプリ連携のためのスキーマ解決。認証不要の公開クエリ（PDS プロキシを経由せず
// AppView へ直接呼ばれる）。DNS 解決を伴うため専用のレート制限を掛ける。
const resolveLexiconLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
xrpc.get(
  `/${NAGI.resolveLexicon}`,
  resolveLexiconLimiter,
  async (req, res, next) => {
    try {
      res
        .set("Cache-Control", "public, max-age=300")
        .json(await resolveLexicon(String(req.query.nsid ?? "")));
    } catch (e) {
      next(e);
    }
  },
);
// アプリのアイコン（favicon）解決。外部ページを fetch するので同じレート制限を掛ける。
// 連携設定時に1回だけ呼ばれ、結果は appLinks レコードへ保存される想定。
xrpc.get(
  `/${NAGI.getAppIcon}`,
  resolveLexiconLimiter,
  async (req, res, next) => {
    try {
      res
        .set("Cache-Control", "public, max-age=3600")
        .json(await getAppIcon(String(req.query.url ?? "")));
    } catch (e) {
      next(e);
    }
  },
);
// 日記は公開コンテンツ（Bluesky 側が公開リプライなのと同じ）なので認証不要。
// ここを認証必須にすると OAuth スコープの追加＝既存ユーザーの再同意が必要になる。
xrpc.get(`/${NAGI.getDiaries}`, async (req, res, next) => {
  try {
    res.set("Cache-Control", "public, max-age=60").json(
      await getDiaries({
        actor: String(req.query.actor ?? ""),
        month: String(req.query.month ?? "") || undefined,
        limit: limit(req.query.limit),
        cursor: String(req.query.cursor ?? "") || undefined,
      }),
    );
  } catch (e) {
    next(e);
  }
});
xrpc.get(
  `/${NAGI.getPositiveNews}`,
  optionalServiceAuth(NAGI.getPositiveNews),
  async (req, res, next) => {
    try {
      const lang = String(req.query.lang ?? "ja");
      if (lang !== "ja" && lang !== "en")
        throw new ApiError(400, "invalid_request", "lang must be ja or en");
      res
        .set(
          "Cache-Control",
          req.viewerDid ? "private, no-store" : "public, max-age=60",
        )
        .json(
          await getPositiveNews({
            limit: Math.min(20, limit(req.query.limit)),
            cursor: String(req.query.cursor ?? "") || undefined,
            lang,
            viewerDid: req.viewerDid,
          }),
        );
    } catch (e) {
      next(e);
    }
  },
);
xrpc.get(`/${NAGI.searchActors}`, async (req, res, next) => {
  try {
    const query = String(req.query.q ?? "");
    res
      .set("Cache-Control", "public, max-age=15")
      .json(await searchActors(query, Math.min(10, limit(req.query.limit))));
  } catch (e) {
    next(e);
  }
});
xrpc.get(
  `/${NAGI.getNotifications}`,
  requiredServiceAuth(NAGI.getNotifications),
  async (req, res, next) => {
    try {
      res
        .set("Cache-Control", "private, no-store")
        .json(await getNotifications(req.viewerDid!, limit(req.query.limit)));
    } catch (e) {
      next(e);
    }
  },
);
xrpc.get(
  `/${NAGI.getUnreadCount}`,
  requiredServiceAuth(NAGI.getUnreadCount),
  async (req, res, next) => {
    try {
      res
        .set("Cache-Control", "private, no-store")
        .json(await getUnreadCount(req.viewerDid!));
    } catch (e) {
      next(e);
    }
  },
);
xrpc.post(
  `/${NAGI.updateSeen}`,
  requiredServiceAuth(NAGI.updateSeen),
  async (req, res, next) => {
    try {
      const seenAt = new Date(req.body.seenAt);
      if (Number.isNaN(seenAt.valueOf()))
        throw new ApiError(400, "invalid_request", "Invalid seenAt");
      res.json(await updateSeen(req.viewerDid!, seenAt));
    } catch (e) {
      next(e);
    }
  },
);
xrpc.post(
  `/${NAGI.registerPushSubscription}`,
  requiredServiceAuth(NAGI.registerPushSubscription),
  async (req, res, next) => {
    try {
      if (!config.vapid)
        throw new ApiError(
          503,
          "push_unavailable",
          "Push notification delivery is not configured",
        );
      const endpoint = req.body?.endpoint;
      const p256dh = req.body?.keys?.p256dh;
      const auth = req.body?.keys?.auth;
      if (
        typeof endpoint !== "string" ||
        typeof p256dh !== "string" ||
        typeof auth !== "string"
      )
        throw new ApiError(400, "invalid_request", "Invalid push subscription");
      res.json(
        await upsertSubscription(req.viewerDid!, {
          endpoint,
          keys: { p256dh, auth },
        }),
      );
    } catch (e) {
      next(e);
    }
  },
);
xrpc.post(
  `/${NAGI.deletePushSubscription}`,
  requiredServiceAuth(NAGI.deletePushSubscription),
  async (req, res, next) => {
    try {
      const endpoint = req.body?.endpoint;
      if (typeof endpoint !== "string")
        throw new ApiError(400, "invalid_request", "Invalid endpoint");
      res.json(await deleteSubscription(endpoint));
    } catch (e) {
      next(e);
    }
  },
);
// 未サインインユーザーでも翻訳できるよう意図的に無認証にしている。キャッシュミス
// ごとに LLM 呼び出しが走るため、共有の /xrpc レート制限に加えて、乱用を抑える専用の
// より厳しいレート制限をこのエンドポイントに設ける。
const translateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
xrpc.post(
  `/${NAGI.translatePost}`,
  translateLimiter,
  async (req, res, next) => {
    try {
      res.json(await translatePost(req.body?.uri, req.body?.targetLang));
    } catch (e) {
      next(e);
    }
  },
);
xrpc.get(
  `/${NAGI.getLinkMetadata}`,
  requiredServiceAuth(NAGI.getLinkMetadata),
  async (req, res, next) => {
    try {
      res
        .set("Cache-Control", "private, no-store")
        .json(
          await getLinkMetadata(
            String(req.query.url ?? ""),
            String(req.query.fallback ?? "") === "true",
          ),
        );
    } catch (e) {
      next(e);
    }
  },
);
xrpc.get(
  `/${NAGI.getLinkThumbnail}`,
  requiredServiceAuth(NAGI.getLinkThumbnail),
  async (req, res, next) => {
    try {
      const thumbnail = await getLinkThumbnail(String(req.query.url ?? ""));
      res
        .set("Cache-Control", "private, no-store")
        .type(thumbnail.contentType)
        .send(Buffer.from(thumbnail.data));
    } catch (e) {
      next(e);
    }
  },
);
xrpc.post(
  `/${NAGI.deleteAccountData}`,
  requiredServiceAuth(NAGI.deleteAccountData),
  async (req, res, next) => {
    try {
      res
        .set("Cache-Control", "private, no-store")
        .json(await deleteAccountData(req.viewerDid!));
    } catch (e) {
      next(e);
    }
  },
);
