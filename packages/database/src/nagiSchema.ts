import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const nagiSchema = pgSchema("nagi");

// pgvector 型（affirmative_bot 側 schema.ts と同じ定義）。snowflake-arctic-embed2 = 1024次元。
const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1024})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map(Number);
  },
});
export const notificationType = nagiSchema.enum("notification_type", [
  "reply",
  "reaction",
  "mention",
  "diary",
]);
export const botJobState = nagiSchema.enum("bot_job_state", [
  "pending",
  "processing",
  "posted",
  "failed",
]);
export const nagiAiReplyMode = nagiSchema.enum("ai_reply_mode", [
  "ai",
  "template",
]);
/** ミュート対象の種別。actor は相手の DID、channel はチャンネルの AT-URI を指す。 */
export const muteSubjectType = nagiSchema.enum("mute_subject_type", [
  "actor",
  "channel",
]);

export const nagiActors = nagiSchema.table("actors", {
  did: text("did").primaryKey(),
  handle: text("handle").notNull(),
  pdsUrl: text("pds_url").notNull(),
  status: text("status").default("active").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const nagiPosts = nagiSchema.table(
  "posts",
  {
    uri: text("uri").primaryKey(),
    cid: text("cid").notNull(),
    rkey: text("rkey").notNull(),
    did: text("did").notNull(),
    text: text("text").notNull(),
    facets: jsonb("facets"),
    // facets の #tag feature から抽出した小文字タグ配列。タグ絞り込み（/search）用。
    // 既存行は NULL（バックフィルなし）。新規/更新投稿から populate される。
    tags: text("tags").array(),
    langs: jsonb("langs"),
    recordJson: jsonb("record_json"),
    replyRootUri: text("reply_root_uri"),
    replyParentUri: text("reply_parent_uri"),
    embedImages: jsonb("embed_images"),
    quoteUri: text("quote_uri"),
    quoteCid: text("quote_cid"),
    quoteValid: boolean("quote_valid").default(false).notNull(),
    // こっそりはスレッドルートだけが所有する。返信の共有可否はこの行自身ではなく
    // replyRootUri の参照先から解決し、プロフィール・スレッドからは引き続き見える。
    kossori: boolean("kossori").default(false).notNull(),
    // 所属チャンネル（com.suibari.nagi.channel）の AT-URI。返信は親の channel を継承する。
    channelUri: text("channel_uri"),
    // true なら CH 限定＝グローバル/全肯定TL非表示（kossori と同じ除外扱い）。CH TLには出る。
    channelOnly: boolean("channel_only").default(false).notNull(),
    repoRev: text("repo_rev"),
    recordCreatedAt: timestamp("record_created_at", {
      withTimezone: true,
    }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // 投稿後編集の検知フラグ。ライブで cid 変化を観測した編集で true になり、以後戻さない
    // （単調）。バックフィルなし＝機能導入後に観測した編集のみ。UI の「編集済み」バッジ用。
    edited: boolean("edited").default(false).notNull(),
    // 意味検索(NL検索の土台)用の本文埋め込み。Ollama(snowflake-arctic-embed2/1024次元)で
    // 生成し、EmbeddingWorker が embedding IS NULL を非同期で埋める。編集(cid変化)時は NULL に
    // 戻して再生成対象化する。バックフィルは同 worker が兼ねる。
    embedding: vector("embedding", { dimensions: 1024 }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("nagi_posts_timeline_idx").on(t.indexedAt, t.uri),
    index("nagi_posts_parent_idx").on(t.replyParentUri),
    index("nagi_posts_actor_idx").on(t.did, t.indexedAt),
    index("nagi_posts_channel_idx").on(t.channelUri, t.indexedAt),
    index("nagi_posts_tags_idx").using("gin", t.tags),
    // 意味検索: cosine 近傍。小さいテーブルでも使える HNSW。
    index("nagi_posts_embedding_hnsw_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
    // 語彙検索: 日本語も部分一致できるよう trigram GIN（要 pg_trgm 拡張）。
    index("nagi_posts_text_trgm_idx").using("gin", t.text.op("gin_trgm_ops")),
  ],
);
/** ユーザーが作るチャンネル（com.suibari.nagi.channel）。作成者の PDS が真実源。 */
export const nagiChannels = nagiSchema.table(
  "channels",
  {
    uri: text("uri").primaryKey(),
    cid: text("cid").notNull(),
    rkey: text("rkey").notNull(),
    did: text("did").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    bannerCid: text("banner_cid"),
    pinnedPostUri: text("pinned_post_uri"),
    pinnedPostCid: text("pinned_post_cid"),
    // NL検索(意味検索)用。ソースは name+description。EmbeddingWorker が生成し、CH 編集で
    // name/description が変わったら NULL に戻して再生成する。
    embedding: vector("embedding", { dimensions: 1024 }),
    recordCreatedAt: timestamp("record_created_at", {
      withTimezone: true,
    }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("nagi_channels_idx").on(t.indexedAt),
    index("nagi_channels_embedding_hnsw_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
    index("nagi_channels_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
  ],
);
/** PDSから取り込んだニュース本体。承認はCID単位で別表に保持する。 */
export const nagiNews = nagiSchema.table(
  "news",
  {
    uri: text("uri").primaryKey(),
    cid: text("cid").notNull(),
    rkey: text("rkey").notNull(),
    did: text("did").notNull(),
    articleId: text("article_id").notNull(),
    url: text("url").notNull(),
    normalizedUrl: text("normalized_url").notNull(),
    titleJa: text("title_ja").notNull(),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    langs: jsonb("langs"),
    // NL検索(意味検索)用。ソースは titleJa[+sourceName]。EmbeddingWorker が生成し、titleJa が
    // 変わったら NULL に戻して再生成する。
    embedding: vector("embedding", { dimensions: 1024 }),
    recordCreatedAt: timestamp("record_created_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("nagi_news_article_id_idx").on(t.articleId),
    index("nagi_news_normalized_url_idx").on(t.normalizedUrl),
    index("nagi_news_feed_idx").on(t.indexedAt, t.uri),
    index("nagi_news_embedding_hnsw_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
    index("nagi_news_title_trgm_idx").using("gin", t.titleJa.op("gin_trgm_ops")),
  ],
);
/** AI・管理者による審査結果。ニュース編集でCIDが変わると古い承認は適用されない。 */
export const nagiNewsApprovals = nagiSchema.table(
  "news_approvals",
  {
    newsUri: text("news_uri").notNull(),
    newsCid: text("news_cid").notNull(),
    status: text("status").notNull(),
    reasonCode: text("reason_code"),
    botCommentJa: text("bot_comment_ja"),
    titleEn: text("title_en"),
    botCommentEn: text("bot_comment_en"),
    snapshotArticleId: text("snapshot_article_id"),
    snapshotUrl: text("snapshot_url"),
    snapshotTitleJa: text("snapshot_title_ja"),
    snapshotSourceName: text("snapshot_source_name"),
    snapshotSourceUrl: text("snapshot_source_url"),
    snapshotPublishedAt: timestamp("snapshot_published_at", { withTimezone: true }),
    snapshotCreatedAt: timestamp("snapshot_created_at", { withTimezone: true }),
    model: text("model"),
    promptVersion: text("prompt_version"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.newsUri, t.newsCid] })],
);
/** 24時間の不採用・Gemma判定キャッシュ。 */
export const nagiNewsScreening = nagiSchema.table("news_screening", {
  cacheKey: text("cache_key").primaryKey(),
  articleId: text("article_id").notNull(),
  decision: text("decision").notNull(),
  reasonCode: text("reason_code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
/** 6時間枠の排他と日次上限集計に使う更新実行記録。 */
export const nagiNewsUpdateRuns = nagiSchema.table("news_update_runs", {
  slot: timestamp("slot", { withTimezone: true }).primaryKey(),
  status: text("status").notNull(),
  publishedCount: integer("published_count").default(0).notNull(),
  newsDataCredits: integer("newsdata_credits").default(0).notNull(),
  retryCount: integer("retry_count").default(0).notNull(),
  lastError: text("last_error"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});
export const nagiPostScores = nagiSchema.table("post_scores", {
  postUri: text("post_uri").primaryKey(),
  score: integer("score").notNull(),
  botReplyUri: text("bot_reply_uri"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const nagiReactions = nagiSchema.table(
  "reactions",
  {
    uri: text("uri").primaryKey(),
    cid: text("cid").notNull(),
    did: text("did").notNull(),
    subjectUri: text("subject_uri").notNull(),
    // Unicode 絵文字そのもの、またはカスタム絵文字のフォールバックテキスト（":name:"）。
    emoji: text("emoji").notNull(),
    // カスタム絵文字のとき blue.moji.collection.item の AT-URI。Unicode なら null。
    emojiUri: text("emoji_uri"),
    // 重複判定用のキー。emojiUri ?? emoji。
    emojiKey: text("emoji_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("nagi_reaction_actor_subject_emoji_key_idx").on(
      t.did,
      t.subjectUri,
      t.emojiKey,
    ),
    index("nagi_reaction_subject_idx").on(t.subjectUri),
  ],
);
export const nagiEmojis = nagiSchema.table(
  "emojis",
  {
    uri: text("uri").primaryKey(),
    cid: text("cid").notNull(),
    did: text("did").notNull(),
    // ":name:" 形式のエイリアス。
    name: text("name").notNull(),
    alt: text("alt"),
    // { png_128?, webp_128?, gif_128?, apng_128? } の blob CID。
    formats: jsonb("formats").notNull(),
    adultOnly: boolean("adult_only").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("nagi_emoji_did_name_idx").on(t.did, t.name),
    index("nagi_emoji_name_idx").on(t.name),
  ],
);
export const nagiProfiles = nagiSchema.table(
  "profiles",
  {
    did: text("did").primaryKey(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    avatarCid: text("avatar_cid"),
    // NL検索(意味検索)用のプロフィール埋め込み。ソースは displayName+description に、あれば
    // botたん分析(nagiActorAnalyses.analysisJa)を連結したもの。EmbeddingWorker が生成し、
    // プロフィール編集・分析更新で NULL に戻して再生成する。
    embedding: vector("embedding", { dimensions: 1024 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("nagi_profiles_embedding_hnsw_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
    index("nagi_profiles_display_name_trgm_idx").using(
      "gin",
      t.displayName.op("gin_trgm_ops"),
    ),
  ],
);
/**
 * botたんが書いたユーザーの日記（com.suibari.nagi.diary）。
 * ポストではないのでタイムラインには一切出ず、通知とプロフィールの日記タブからのみ参照する。
 */
export const nagiDiaries = nagiSchema.table(
  "diaries",
  {
    uri: text("uri").primaryKey(),
    cid: text("cid").notNull(),
    /** 書き手。bot 以外は取り込まない。 */
    did: text("did").notNull(),
    /** 日記の対象ユーザー。 */
    subjectDid: text("subject_did").notNull(),
    /** ユーザーのローカル日付 "YYYY-MM-DD"。 */
    diaryDate: text("diary_date").notNull(),
    text: text("text").notNull(),
    titleJa: text("title_ja"),
    titleEn: text("title_en"),
    langs: jsonb("langs"),
    recordCreatedAt: timestamp("record_created_at", {
      withTimezone: true,
    }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("nagi_diary_subject_date_idx").on(t.subjectDid, t.diaryDate),
    index("nagi_diary_subject_idx").on(t.subjectDid, t.diaryDate),
  ],
);
export const nagiNotifications = nagiSchema.table(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipientDid: text("recipient_did").notNull(),
    type: notificationType("type").notNull(),
    actorDid: text("actor_did").notNull(),
    subjectUri: text("subject_uri").notNull(),
    reasonUri: text("reason_uri").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("nagi_notification_reason_idx").on(t.recipientDid, t.reasonUri),
    index("nagi_notification_inbox_idx").on(t.recipientDid, t.createdAt),
  ],
);
export const nagiTranslations = nagiSchema.table(
  "translations",
  {
    postUri: text("post_uri").notNull(),
    targetLang: text("target_lang").notNull(),
    text: text("text").notNull(),
    cacheVersion: integer("cache_version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.postUri, t.targetLang] })],
);
export const nagiIngestState = nagiSchema.table("ingest_state", {
  key: text("key").primaryKey(),
  cursor: bigint("cursor", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const nagiProcessedEvents = nagiSchema.table("processed_events", {
  id: text("id").primaryKey(),
  timeUs: bigint("time_us", { mode: "number" }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const nagiBotReplyJobs = nagiSchema.table(
  "bot_reply_jobs",
  {
    sourceUri: text("source_uri").primaryKey(),
    sourceCid: text("source_cid").notNull(),
    authorDid: text("author_did").notNull(),
    recordJson: jsonb("record_json").notNull(),
    state: botJobState("state").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    replyUri: text("reply_uri"),
    score: integer("score"),
    lastError: text("last_error"),
    generationMode: nagiAiReplyMode("generation_mode"),
    limitReason: text("limit_reason"),
    modeDecidedAt: timestamp("mode_decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("nagi_bot_jobs_ready_idx").on(t.state, t.nextAttemptAt),
    index("nagi_bot_jobs_ai_quota_idx").on(
      t.authorDid,
      t.generationMode,
      t.modeDecidedAt,
    ),
  ],
);
/**
 * Nagi の有料AI返信が Gemini へ実際に送信される直前の予約台帳。
 * サービス全体枠だけに使うため、DID・投稿URI・本文は保存しない。
 */
export const nagiAiReplyRequests = nagiSchema.table(
  "ai_reply_requests",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("nagi_ai_reply_requests_time_idx").on(t.requestedAt)],
);
/**
 * botたんの自動分析（プロフィールの「ひとこと」吹き出し）。did 単位で最新1件を upsert 保存する。
 * source='bluesky'（Nagi初回登録時、Bluesky投稿を分析）/ 'nagi'（Nagi投稿100到達ごと、Nagi投稿+リアクションを分析）。
 * 称号(currentTitle)には干渉しない（本文のみ）。閲覧者の lang で ja/en を出し分ける。
 */
export const nagiActorAnalyses = nagiSchema.table("actor_analyses", {
  did: text("did").primaryKey(),
  analysisJa: text("analysis_ja").notNull(),
  analysisEn: text("analysis_en").notNull(),
  source: text("source").notNull(),
  postCountAt: integer("post_count_at"),
  model: text("model"),
  promptVersion: text("prompt_version"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
/**
 * 自動分析のリースキュー（nagiBotReplyJobs と同型）。エンキューは AppView ingest が担い、
 * 処理は nagi_bot_server の NagiAnalysisWorker が担う。id は冪等キー
 * （初回=`${did}#first` / 100到達=`${did}#nagi#${count}`）で二重投入を防ぐ。
 */
export const nagiAnalysisJobs = nagiSchema.table(
  "analysis_jobs",
  {
    id: text("id").primaryKey(),
    did: text("did").notNull(),
    source: text("source").notNull(),
    postCountAt: integer("post_count_at"),
    state: botJobState("state").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("nagi_analysis_jobs_ready_idx").on(t.state, t.nextAttemptAt)],
);
// Web Push の購読。endpoint がプッシュサービス上の宛先で自然な一意キー。同一ユーザーが
// 複数デバイス/ブラウザから購読するため did ごとに複数行を持ちうる（did で索引）。
export const nagiPushSubscriptions = nagiSchema.table(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    recipientDid: text("recipient_did").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("nagi_push_subscription_did_idx").on(t.recipientDid)],
);
/**
 * ビューア単位のミュート。**他ユーザーに公開してはならない情報**なので、PDS レコード
 * （= listRecords で誰でも読める）にはせず AppView だけが持つ。所有者本人の getMutes
 * 以外からは決して外に出さないこと。ミュートは PDS に残らないので他アプリとは共有されず、
 * この DB を作り直すと失われる（Bluesky のミュートと同じトレードオフ）。
 */
export const nagiMutes = nagiSchema.table(
  "mutes",
  {
    muterDid: text("muter_did").notNull(),
    subjectType: muteSubjectType("subject_type").notNull(),
    /** actor なら対象の DID、channel なら channel レコードの AT-URI。 */
    subject: text("subject").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.muterDid, t.subjectType, t.subject] }),
    index("nagi_mutes_muter_idx").on(t.muterDid, t.subjectType),
  ],
);

/**
 * 全肯定カード（1日1回引けるトレカ）の「世界に1枚」の実体。
 *
 * **PDS レコードにはしない**（ミュートと同じ判断だが理由は別）。ガチャ結果をユーザー自身の
 * repo に置くと、クライアントが createRecord で AAR を自作できてしまい非改竄性が保てない。
 * また将来の交換は2つの repo にまたがるため原子的に行えない。よって AppView が権威を持つ。
 * この DB を作り直すと所持カードは失われる。
 *
 * id は交換しても不変（所有者が変わっても「その1枚」であり続ける）。botたんコメントは
 * この行に紐づくので、owner_did を差し替えるだけで「交換してもコメントは維持される」が成立する。
 * どのカードかは (card_volume, card_number) で決まり、shared-configs の cards_v{n}.json を指す。
 * **一度リリースした番号は変更禁止**（振り直すとこの列の指す先が変わる）。
 */
export const nagiCardInstances = nagiSchema.table(
  "card_instances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** カード段。cards_v{volume}.json に対応。 */
    cardVolume: integer("card_volume").notNull(),
    /** 段内の通し番号。定義本体（名前/フレーバー/ATK）は JSON 側が真実源で DB には持たない。 */
    cardNumber: integer("card_number").notNull(),
    /** 現所有者。交換で書き換わる唯一の列。 */
    ownerDid: text("owner_did").notNull(),
    /** 最初にこの1枚を引いた人。交換で流通しても出所が追える。 */
    firstOwnerDid: text("first_owner_did").notNull(),
    /** 引いた瞬間に botたんが付けるコメント。NULL = まだ生成待ち（UI はコメント無しで表示）。 */
    commentJa: text("comment_ja"),
    commentEn: text("comment_en"),
    commentModel: text("comment_model"),
    commentPromptVersion: text("comment_prompt_version"),
    /** 同じカードを引き直した回数（初回=1）。将来の交換素材にも使える。 */
    duplicateCount: integer("duplicate_count").default(1).notNull(),
    /** 現所有者がこの1枚を手にした時刻（引き直し・交換で更新される）。 */
    acquiredAt: timestamp("acquired_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // コレクションは「集合」。同種を引き直しても行は増やさず duplicate_count を上げる。
    // 先頭が owner_did なので、コレクション一覧の owner_did 検索もこの索引で足りる。
    uniqueIndex("nagi_card_instance_owner_card_idx").on(
      t.ownerDid,
      t.cardVolume,
      t.cardNumber,
    ),
  ],
);

/**
 * 日次ドローの記録。(did, draw_date) の主キーそのものが「1日1回」の強制になっている
 * （アプリ側のチェックではなく DB 制約で担保するので、同時押しでも二重ドローにならない）。
 * draw_date は JST 4:00 始まりの "YYYY-MM-DD"（shared-configs の cardDrawDate が算出）。
 */
export const nagiCardDraws = nagiSchema.table(
  "card_draws",
  {
    did: text("did").notNull(),
    drawDate: text("draw_date").notNull(),
    cardVolume: integer("card_volume").notNull(),
    cardNumber: integer("card_number").notNull(),
    /**
     * 引き当てた実体。日次ロックを先に取る必要があるので insert 時点では未確定で、
     * 同一トランザクション内の直後に埋める（= 実際に NULL のまま残ることはない）。
     */
    instanceId: uuid("instance_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // 主キー (did, draw_date) が「今日引いたか」の検索索引そのものなので、追加の索引は要らない。
  (t) => [primaryKey({ columns: [t.did, t.drawDate] })],
);

/**
 * botたんコメント生成のリースキュー（nagiAnalysisJobs と同型）。
 * エンキューは AppView の drawCard、処理は nagi_bot_server の NagiCardCommentWorker。
 * instance_id が主キーなので、同じ1枚に対するジョブは常に1件（引き直しでも上書き）。
 */
export const nagiCardCommentJobs = nagiSchema.table(
  "card_comment_jobs",
  {
    instanceId: uuid("instance_id").primaryKey(),
    state: botJobState("state").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("nagi_card_comment_jobs_ready_idx").on(t.state, t.nextAttemptAt)],
);
