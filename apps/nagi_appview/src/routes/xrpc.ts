import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import {
  optionalServiceAuth,
  requiredServiceAuth,
} from "../auth/serviceAuth.js";
import { getTimeline } from "../queries/timeline.js";
import { searchPostsByText } from "../queries/search.js";
import {
  getChannel,
  getChannelTimeline,
  getChannels,
  searchChannels,
  searchChannelsTypeahead,
} from "../queries/channels.js";
import { getActorProfile, getReactedFeed } from "../queries/profile.js";
import { resolveActorDid, searchActors } from "../queries/actors.js";
import { getThread } from "../queries/thread.js";
import {
  getNotifications,
  getUnreadCount,
  updateSeen,
} from "../queries/notifications.js";
import { getDiaries } from "../queries/diaries.js";
import { getPositiveNews, searchNews } from "../queries/positiveNews.js";
import {
  deleteSubscription,
  upsertSubscription,
} from "../queries/pushSubscriptions.js";
import { translatePost, translatePosts } from "../services/translation.js";
import { ApiError } from "../middleware/errors.js";
import { deleteAccountData } from "../services/deleteAccountData.js";
import {
  getAppIcon,
  getLinkMetadata,
  getLinkThumbnail,
} from "../services/linkMetadata.js";
import { getEmoji, searchEmojis } from "../services/emoji.js";
import { resolveLexicon } from "../queries/resolveLexicon.js";
import { getMutesView, setMute } from "../queries/mutes.js";
import {
  getPrivateList,
  setPrivateListMember,
} from "../queries/privateList.js";
import { setChannelSubscription } from "../queries/channelSubscriptions.js";
import { getMyNagi } from "../queries/myNagi.js";
import { drawCard, getCards } from "../queries/cards.js";
import { getCommunityAffirmations } from "../queries/communityAffirmations.js";
import { getProfileWebsiteCard } from "../services/profileWebsite.js";
import { config } from "../config.js";
import {
  getMyNewsSubmissions,
  getNewsSubmissionPreview,
  requestNewsReview,
} from "../services/userNewsSubmissions.js";
import {
  ensurePdsRecord,
  isReconcilableCollection,
} from "../ingest/reconcileRepo.js";
import { prioritizeReconcile } from "../ingest/reconcileWorker.js";
import { parseRecordUri } from "../ingest/recordUri.js";
export const xrpc = Router();
const limit = (value: unknown) =>
  Math.min(100, Math.max(1, Number(value ?? 50) || 50));

xrpc.get(
  `/${NAGI.getCommunityAffirmations}`,
  requiredServiceAuth(NAGI.getCommunityAffirmations),
  async (req, res, next) => {
    try {
      const lang = String(req.query.lang ?? "ja");
      if (lang !== "ja" && lang !== "en")
        throw new ApiError(400, "invalid_request", "lang must be ja or en");
      const data = await getCommunityAffirmations({
        viewerDid: req.viewerDid!,
        lang,
        limit: Math.min(20, limit(req.query.limit)),
        cursor: String(req.query.cursor ?? "") || undefined,
      });
      res.set("Cache-Control", "private, no-store").json(data);
    } catch (error) {
      next(error);
    }
  },
);

xrpc.get(
  `/${NAGI.getHomeTimeline}`,
  requiredServiceAuth(NAGI.getHomeTimeline),
  async (req, res, next) => {
    try {
      const data = await getTimeline({
        limit: limit(req.query.limit),
        cursor: String(req.query.cursor ?? "") || undefined,
        viewerDid: req.viewerDid!,
        homeDid: req.viewerDid!,
        group: true,
      });
      res.set("Cache-Control", "private, no-store").json(data);
    } catch (e) {
      next(e);
    }
  },
);

xrpc.post(
  `/${NAGI.ensureRecord}`,
  requiredServiceAuth(NAGI.ensureRecord),
  async (req, res, next) => {
    try {
      const uri = req.body?.uri;
      const expectedCid = req.body?.cid;
      if (typeof uri !== "string" || typeof expectedCid !== "string")
        throw new ApiError(400, "invalid_request", "uri and cid are required");
      const parsed = parseRecordUri(uri);
      if (!parsed)
        throw new ApiError(400, "invalid_request", "Invalid record URI");
      const { did, collection, rkey } = parsed;
      if (did !== req.viewerDid)
        throw new ApiError(403, "forbidden", "Record owner does not match");
      if (!isReconcilableCollection(did, collection))
        throw new ApiError(
          400,
          "invalid_request",
          "Collection is not supported",
        );

      const current = await ensurePdsRecord(did, collection, rkey);
      if (current.uri !== uri)
        throw new ApiError(
          409,
          "invalid_record",
          "PDS returned a different record URI",
        );
      prioritizeReconcile(did);
      res
        .set("Cache-Control", "private, no-store")
        .json({ uri: current.uri, cid: current.cid, indexed: true });
    } catch (e) {
      next(e);
    }
  },
);
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
        // 会話グループ化はメイン共有TLのみ。全肯定TLは Phase 2 まで従来表示。
        group: !affirmation,
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
      const actorParam = String(req.query.actor ?? "");
      if (!actorParam)
        throw new ApiError(400, "invalid_request", "actor is required");
      const actor = await resolveActorDid(actorParam);
      const filter = String(req.query.filter ?? "posts");
      if (!["posts", "replies", "media", "reactions"].includes(filter))
        throw new ApiError(400, "invalid_request", "Invalid filter");
      const cursor = String(req.query.cursor ?? "") || undefined;
      const group = String(req.query.group ?? "false") === "true";
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
              group,
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
xrpc.get(`/${NAGI.getProfileWebsite}`, async (req, res, next) => {
  try {
    const actorParam = String(req.query.actor ?? "");
    if (!actorParam)
      throw new ApiError(400, "invalid_request", "actor is required");
    const did = await resolveActorDid(actorParam);
    const card = await getProfileWebsiteCard(did);
    res.set("Cache-Control", "public, max-age=60").json({ card });
  } catch (e) {
    next(e);
  }
});
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
            viewerDid: req.viewerDid,
          }),
        );
    } catch (e) {
      next(e);
    }
  },
);
xrpc.get(
  `/${NAGI.searchChannels}`,
  optionalServiceAuth(NAGI.searchChannels),
  async (req, res, next) => {
    try {
      const q = String(req.query.q ?? "")
        .trim()
        .slice(0, 200);
      if (!q) throw new ApiError(400, "invalid_request", "q is required");
      const typeahead = String(req.query.typeahead ?? "") === "true";
      res
        .set(
          "Cache-Control",
          req.viewerDid ? "private, no-store" : "public, max-age=15",
        )
        .json(
          await (typeahead
            ? searchChannelsTypeahead({
                q,
                limit: Math.min(10, limit(req.query.limit)),
                viewerDid: req.viewerDid,
              })
            : searchChannels({
                q,
                limit: limit(req.query.limit),
                cursor: String(req.query.cursor ?? "") || undefined,
                viewerDid: req.viewerDid,
              })),
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
      // 自由文検索(q)を優先。無ければ従来のタグ検索(tag)にフォールバック。
      const q = String(req.query.q ?? "")
        .trim()
        .slice(0, 200);
      const tag = String(req.query.tag ?? "")
        .trim()
        .toLowerCase();
      if (!q && !tag) {
        throw new ApiError(400, "invalid_request", "q or tag is required");
      }
      const cacheControl = req.viewerDid
        ? "private, no-store"
        : "public, max-age=15";
      if (q) {
        res.set("Cache-Control", cacheControl).json(
          await searchPostsByText({
            q,
            limit: limit(req.query.limit),
            cursor: String(req.query.cursor ?? "") || undefined,
            viewerDid: req.viewerDid,
          }),
        );
        return;
      }
      res.set("Cache-Control", cacheControl).json(
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
          excludeRepo: String(req.query.excludeRepo ?? "") || undefined,
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
xrpc.get(
  `/${NAGI.searchNews}`,
  optionalServiceAuth(NAGI.searchNews),
  async (req, res, next) => {
    try {
      const q = String(req.query.q ?? "")
        .trim()
        .slice(0, 200);
      if (!q) throw new ApiError(400, "invalid_request", "q is required");
      const lang = String(req.query.lang ?? "ja");
      if (lang !== "ja" && lang !== "en")
        throw new ApiError(400, "invalid_request", "lang must be ja or en");
      res
        .set(
          "Cache-Control",
          req.viewerDid ? "private, no-store" : "public, max-age=60",
        )
        .json(
          await searchNews({
            q,
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
xrpc.get(
  `/${NAGI.getNewsSubmissionPreview}`,
  requiredServiceAuth(NAGI.getNewsSubmissionPreview),
  async (req, res, next) => {
    try {
      res
        .set("Cache-Control", "private, no-store")
        .json(await getNewsSubmissionPreview(String(req.query.url ?? "")));
    } catch (error) {
      next(error);
    }
  },
);
xrpc.post(
  `/${NAGI.requestNewsReview}`,
  requiredServiceAuth(NAGI.requestNewsReview),
  async (req, res, next) => {
    try {
      const subject = req.body?.subject;
      if (!subject || typeof subject.uri !== "string" || typeof subject.cid !== "string")
        throw new ApiError(400, "invalid_request", "subject StrongRef is required");
      res
        .set("Cache-Control", "private, no-store")
        .json(await requestNewsReview(req.viewerDid!, subject));
    } catch (error) {
      next(error);
    }
  },
);
xrpc.get(
  `/${NAGI.getMyNewsSubmissions}`,
  requiredServiceAuth(NAGI.getMyNewsSubmissions),
  async (req, res, next) => {
    try {
      res
        .set("Cache-Control", "private, no-store")
        .json(await getMyNewsSubmissions(req.viewerDid!, Math.min(20, limit(req.query.limit))));
    } catch (error) {
      next(error);
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
// ミュートは非公開情報。requiredServiceAuth により、JWT で本人だと証明できたリクエストに
// しか返さない（他ユーザーが誰かのミュート一覧を引く経路は存在しない）。
xrpc.get(
  `/${NAGI.getMutes}`,
  requiredServiceAuth(NAGI.getMutes),
  async (req, res, next) => {
    try {
      res
        .set("Cache-Control", "private, no-store")
        .json(await getMutesView(req.viewerDid!));
    } catch (e) {
      next(e);
    }
  },
);
xrpc.post(
  `/${NAGI.setMute}`,
  requiredServiceAuth(NAGI.setMute),
  async (req, res, next) => {
    try {
      const subjectType = req.body?.subjectType;
      const subject = req.body?.subject;
      const muted = req.body?.muted;
      if (subjectType !== "actor" && subjectType !== "channel")
        throw new ApiError(400, "invalid_request", "Invalid subjectType");
      if (typeof subject !== "string" || !subject)
        throw new ApiError(400, "invalid_request", "subject is required");
      if (typeof muted !== "boolean")
        throw new ApiError(400, "invalid_request", "muted must be a boolean");
      res
        .set("Cache-Control", "private, no-store")
        .json(await setMute(req.viewerDid!, subjectType, subject, muted));
    } catch (e) {
      next(e);
    }
  },
);
// ホームリストは本人以外へ存在すら知らせない。owner DID は入力で受け取らず、
// requiredServiceAuth が検証した viewerDid だけを使用する。
xrpc.get(
  `/${NAGI.getPrivateList}`,
  requiredServiceAuth(NAGI.getPrivateList),
  async (req, res, next) => {
    try {
      res
        .set("Cache-Control", "private, no-store")
        .json(await getPrivateList(req.viewerDid!));
    } catch (e) {
      next(e);
    }
  },
);
xrpc.post(
  `/${NAGI.setPrivateListMember}`,
  requiredServiceAuth(NAGI.setPrivateListMember),
  async (req, res, next) => {
    try {
      const memberDid = req.body?.memberDid;
      const included = req.body?.included;
      if (typeof memberDid !== "string" || !memberDid)
        throw new ApiError(400, "invalid_request", "memberDid is required");
      if (typeof included !== "boolean")
        throw new ApiError(
          400,
          "invalid_request",
          "included must be a boolean",
        );
      res
        .set("Cache-Control", "private, no-store")
        .json(await setPrivateListMember(req.viewerDid!, memberDid, included));
    } catch (e) {
      next(e);
    }
  },
);
// my Nagi の集約。本人のリストと購読状況が丸ごと出るので、必ず認証必須かつ no-store。
xrpc.get(
  `/${NAGI.getMyNagi}`,
  requiredServiceAuth(NAGI.getMyNagi),
  async (req, res, next) => {
    try {
      const raw = req.query.limit;
      res.set("Cache-Control", "private, no-store").json(
        await getMyNagi({
          viewerDid: req.viewerDid!,
          ...(raw === undefined ? {} : { limit: Number(raw) || undefined }),
        }),
      );
    } catch (e) {
      next(e);
    }
  },
);
// 参加中チャンネルもホームリストと同じく本人だけのもの。owner DID は入力で受け取らない。
xrpc.post(
  `/${NAGI.setChannelSubscription}`,
  requiredServiceAuth(NAGI.setChannelSubscription),
  async (req, res, next) => {
    try {
      const uri = req.body?.uri;
      const subscribed = req.body?.subscribed;
      if (typeof uri !== "string" || !uri)
        throw new ApiError(400, "invalid_request", "uri is required");
      if (typeof subscribed !== "boolean")
        throw new ApiError(
          400,
          "invalid_request",
          "subscribed must be a boolean",
        );
      res
        .set("Cache-Control", "private, no-store")
        .json(await setChannelSubscription(req.viewerDid!, uri, subscribed));
    } catch (e) {
      next(e);
    }
  },
);
// カードの所持状況は公開情報（他人のコレクションも見える）なので optional 認証。
// 自分を指定したときだけ drawStatus が付くので、キャッシュは常に private にしておく。
xrpc.get(
  `/${NAGI.getCards}`,
  optionalServiceAuth(NAGI.getCards),
  async (req, res, next) => {
    try {
      const actor = String(req.query.actor ?? "");
      if (!actor)
        throw new ApiError(400, "invalid_request", "actor is required");
      res
        .set("Cache-Control", "private, no-store")
        .json(await getCards(actor, req.viewerDid));
    } catch (e) {
      next(e);
    }
  },
);
// 抽選はサーバ側でしか行わない。入力を一切取らないのは、引くカードをクライアントが
// 指定できる余地を作らないため。
xrpc.post(
  `/${NAGI.drawCard}`,
  requiredServiceAuth(NAGI.drawCard),
  async (req, res, next) => {
    try {
      res
        .set("Cache-Control", "private, no-store")
        .json(await drawCard(req.viewerDid!));
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
// 未サインインユーザーでも翻訳できるよう意図的に無認証にしている。
// キャッシュヒットまで一律に数えるHTTPリクエスト単位のLimiterは使わず、
// translation service がDB照会後の未生成投稿数だけをIP単位で制限する。
xrpc.post(`/${NAGI.translatePosts}`, async (req, res, next) => {
  try {
    res.json(
      await translatePosts(
        req.body?.uris,
        req.body?.targetLang,
        req.ip ?? "unknown",
        req.body?.cacheOnly === true,
      ),
    );
  } catch (e) {
    next(e);
  }
});
xrpc.post(`/${NAGI.translatePost}`, async (req, res, next) => {
  try {
    res.json(
      await translatePost(
        req.body?.uri,
        req.body?.targetLang,
        req.ip ?? "unknown",
      ),
    );
  } catch (e) {
    next(e);
  }
});
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
