import { AtpAgent } from "@atproto/api";
import {
  db,
  nagiActorAnalyses,
  nagiAnalysisJobs,
  nagiPosts,
  nagiProfiles,
  nagiReactions,
} from "@bsky-affirmative-bot/database";
import {
  generateNagiAnalysis,
  NAGI_ANALYSIS_PROMPT_VERSION,
  type NagiAnalysisInput,
} from "@bsky-affirmative-bot/bot-brain";
import { MODEL_GEMINI } from "@bsky-affirmative-bot/shared-configs";
import { and, desc, eq, isNull } from "drizzle-orm";
import { agent } from "./agent.js";
import { getConcatAuthorFeed } from "./bsky/getConcatAuthorFeed.js";
import { getConcatPosts } from "./bsky/getConcatPosts.js";
import { getPds } from "./bsky/getPds.js";

export type AnalysisSource = "bluesky" | "nagi";

/** 分析対象の入力。source ごとに集め方が違う。 */
export interface AnalysisJobLike {
  did: string;
  source: string;
  postCountAt: number | null;
}

/** ジョブをキューする（冪等キーで二重投入を防ぐ）。動作確認用の内部エンドポイントからも使う。 */
export async function enqueueAnalysis(params: {
  did: string;
  source: AnalysisSource;
  postCountAt?: number;
}): Promise<void> {
  const id =
    params.source === "bluesky"
      ? `${params.did}#first`
      : `${params.did}#nagi#${params.postCountAt ?? 0}`;
  await db
    .insert(nagiAnalysisJobs)
    .values({
      id,
      did: params.did,
      source: params.source,
      postCountAt: params.postCountAt ?? null,
    })
    .onConflictDoNothing();
}

/** Bluesky 投稿＋いいねを集める（Nagi 初回登録時）。public appview 読み出しで認可不要。 */
async function gatherBlueskyInput(did: string): Promise<NagiAnalysisInput> {
  const profile = await agent.getProfile({ actor: did }).catch(() => undefined);
  const displayName = profile?.data.displayName || profile?.data.handle || did;

  const feeds = await getConcatAuthorFeed(did, 100);
  const posts = feeds.map((feed) => (feed.post.record as any).text as string);

  // いいねは対象ユーザーの PDS から listRecords（原 AnalyzeFeature と同じ）。
  let liked: string[] = [];
  try {
    const pdsAgent = new AtpAgent({ service: await getPds(did) });
    const likeRes = await pdsAgent.com.atproto.repo.listRecords({
      repo: did,
      collection: "app.bsky.feed.like",
      limit: 100,
    });
    const uris = likeRes.data.records
      .map((record) => (record.value as any)?.subject?.uri)
      .filter((uri): uri is string => typeof uri === "string");
    liked = (await getConcatPosts(uris)).map(
      (post) => (post.record as any).text as string,
    );
  } catch (error) {
    console.warn(
      `[WARN][NAGI][ANALYSIS] Failed to collect Bluesky likes for ${did}:`,
      error,
    );
  }

  return { displayName, posts, liked, isSubscriber: false };
}

/** Nagi 投稿（直近100件）＋リアクションを集める（Nagi 投稿100到達時）。 */
async function gatherNagiInput(did: string): Promise<NagiAnalysisInput> {
  const [[profile], postRows, reactionRows] = await Promise.all([
    db
      .select({ displayName: nagiProfiles.displayName })
      .from(nagiProfiles)
      .where(eq(nagiProfiles.did, did)),
    db
      .select({ text: nagiPosts.text })
      .from(nagiPosts)
      .where(and(eq(nagiPosts.did, did), isNull(nagiPosts.deletedAt)))
      .orderBy(desc(nagiPosts.recordCreatedAt))
      .limit(100),
    db
      .select({ text: nagiPosts.text })
      .from(nagiReactions)
      .innerJoin(nagiPosts, eq(nagiPosts.uri, nagiReactions.subjectUri))
      .where(and(eq(nagiReactions.did, did), isNull(nagiPosts.deletedAt)))
      .orderBy(desc(nagiReactions.indexedAt))
      .limit(100),
  ]);

  return {
    displayName: profile?.displayName || did,
    posts: postRows.map((row) => row.text),
    liked: reactionRows.map((row) => row.text),
    isSubscriber: false,
  };
}

/**
 * 1件の分析ジョブを処理する。投稿を集め、botたんの「ひとこと」を ja/en で生成し、
 * nagi.actor_analyses に did 単位で upsert する（最新で上書き）。
 */
export async function runNagiAnalysis(job: AnalysisJobLike): Promise<void> {
  const input =
    job.source === "bluesky"
      ? await gatherBlueskyInput(job.did)
      : await gatherNagiInput(job.did);

  if (input.posts.length === 0) {
    // 分析対象の投稿が無ければ何もしない（失敗ではなくスキップ）。
    console.log(
      `[INFO][NAGI][ANALYSIS] No posts for ${job.did} (source=${job.source}); skipping.`,
    );
    return;
  }

  const result = await generateNagiAnalysis(input);
  if (!result.analysisJa && !result.analysisEn) {
    throw new Error("generateNagiAnalysis returned empty analysis");
  }

  const now = new Date();
  await db
    .insert(nagiActorAnalyses)
    .values({
      did: job.did,
      analysisJa: result.analysisJa,
      analysisEn: result.analysisEn,
      source: job.source,
      postCountAt: job.postCountAt,
      model: MODEL_GEMINI,
      promptVersion: NAGI_ANALYSIS_PROMPT_VERSION,
    })
    .onConflictDoUpdate({
      target: nagiActorAnalyses.did,
      set: {
        analysisJa: result.analysisJa,
        analysisEn: result.analysisEn,
        source: job.source,
        postCountAt: job.postCountAt,
        model: MODEL_GEMINI,
        promptVersion: NAGI_ANALYSIS_PROMPT_VERSION,
        updatedAt: now,
      },
    });
}
