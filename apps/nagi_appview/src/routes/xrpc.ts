import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import {
  optionalServiceAuth,
  requiredServiceAuth,
} from "../auth/serviceAuth.js";
import { getTimeline } from "../queries/timeline.js";
import { getActorProfile, getReactedFeed } from "../queries/profile.js";
import { searchActors } from "../queries/actors.js";
import { getThread } from "../queries/thread.js";
import { getNotifications, updateSeen } from "../queries/notifications.js";
import { translatePost } from "../services/translation.js";
import { ApiError } from "../middleware/errors.js";
import { deleteAccountData } from "../services/deleteAccountData.js";
import { getLinkMetadata, getLinkThumbnail } from "../services/linkMetadata.js";
import { getEmoji, searchEmojis } from "../services/emoji.js";
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
      const [profile, feed] = await Promise.all([
        getActorProfile(actor),
        filter === "reactions"
          ? getReactedFeed({
              actorDid: actor,
              limit: limit(req.query.limit),
              cursor,
              viewerDid: req.viewerDid,
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
