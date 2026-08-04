/**
 * 「どの機能にどのモデル / ServiceTier を充てるか」の唯一の一覧表。
 *
 * 機能側のコードにはモデル名を書かない。各AI呼び出しは自分の機能キー（AiFeatureKey）を
 * 名乗るだけで、実際のモデルと ServiceTier はこのファイルが決める。
 * モデルを変えたいときに触るのは、
 *   - このファイルの AI_FEATURES の1行、または
 *   - 環境変数 AI_ROUTE_<機能キー>（例: AI_ROUTE_BSKY_CONVERSATION=flash-standard）
 * のどちらかだけ。conversation.ts などの機能コードは一切いじらない。
 *
 * 【重要】このファイルは module scope で process.env を読んではいけない。
 * 各アプリの dotenv.config() はモジュール本体で走る = ESM では全 import 評価の「後」。
 * トップレベルで env を読むと .env の上書きが黙って無視される。
 * そのため解決は resolveAiRoute() の初回呼び出し時に行い、メモ化する。
 */

// ---------------------------------------------------------------------------
// 層1: モデル別名 → 実モデルID
// 実際のモデル名が登場するのはこの表だけ。
// ---------------------------------------------------------------------------

export type ModelAliasName =
  | "gemini-lite"
  | "gemini-flash"
  | "gemini-image"
  | "gemini-embedding"
  | "ollama-chat"
  | "ollama-embed"
  | "ollama-translate"
  | "ollama-bot-translate";

type ModelAliasSpec = {
  /** このモデル別名を差し替える環境変数名 */
  env: string;
  /** env 未設定時の既定。呼び出し時に評価される（module scope で env を読まないため） */
  fallback: () => string;
};

const MODEL_ALIAS_SPECS: Record<ModelAliasName, ModelAliasSpec> = {
  "gemini-lite": { env: "MODEL_GEMINI_LITE", fallback: () => "gemini-2.5-flash-lite" },
  "gemini-flash": { env: "MODEL_GEMINI_FLASH", fallback: () => "gemini-2.5-flash" },
  "gemini-image": { env: "MODEL_GEMINI_IMAGE", fallback: () => "gemini-2.5-flash-image-preview" },
  "gemini-embedding": { env: "MODEL_GEMINI_EMBEDDING", fallback: () => "gemini-embedding-001" },
  "ollama-chat": { env: "OLLAMA_MODEL", fallback: () => "gemma3:4b" },
  "ollama-embed": { env: "OLLAMA_EMBED_MODEL", fallback: () => "snowflake-arctic-embed2" },
  "ollama-translate": { env: "OLLAMA_TRANSLATION_MODEL", fallback: () => "translategemma:4b" },
  // botたん翻訳は「専用env → 汎用OLLAMA_MODEL → 既定」の三段フォールバックを維持する
  "ollama-bot-translate": {
    env: "OLLAMA_BOT_TRANSLATION_MODEL",
    fallback: () => process.env.OLLAMA_MODEL?.trim() || "gemma3:4b",
  },
};

// ---------------------------------------------------------------------------
// 層2: ルート = モデル別名 × ServiceTier
// ---------------------------------------------------------------------------

export type AiProvider = "gemini" | "ollama";

/**
 * "auto" は「serviceTier を送らない（Google 既定に任せる）」の意味。
 * 現状 serviceTier を設定していない呼び出しを挙動そのままで移行するために必要。
 */
export type AiTier = "flex" | "standard" | "auto";

export type AiRouteName =
  | "lite-flex"
  | "lite-standard"
  | "lite-auto"
  | "flash-flex"
  | "flash-standard"
  | "flash-auto"
  | "image-auto"
  | "embedding-auto"
  | "ollama-chat"
  | "ollama-embed"
  | "ollama-translate"
  | "ollama-bot-translate";

type AiRouteSpec = { provider: AiProvider; alias: ModelAliasName; tier: AiTier };

export const AI_ROUTES = {
  "lite-flex": { provider: "gemini", alias: "gemini-lite", tier: "flex" },
  "lite-standard": { provider: "gemini", alias: "gemini-lite", tier: "standard" },
  "lite-auto": { provider: "gemini", alias: "gemini-lite", tier: "auto" },
  "flash-flex": { provider: "gemini", alias: "gemini-flash", tier: "flex" },
  "flash-standard": { provider: "gemini", alias: "gemini-flash", tier: "standard" },
  "flash-auto": { provider: "gemini", alias: "gemini-flash", tier: "auto" },
  "image-auto": { provider: "gemini", alias: "gemini-image", tier: "auto" },
  "embedding-auto": { provider: "gemini", alias: "gemini-embedding", tier: "auto" },
  // Ollama はローカル実行なので ServiceTier の概念がない
  "ollama-chat": { provider: "ollama", alias: "ollama-chat", tier: "auto" },
  "ollama-embed": { provider: "ollama", alias: "ollama-embed", tier: "auto" },
  "ollama-translate": { provider: "ollama", alias: "ollama-translate", tier: "auto" },
  "ollama-bot-translate": { provider: "ollama", alias: "ollama-bot-translate", tier: "auto" },
} as const satisfies Record<AiRouteName, AiRouteSpec>;

export const AI_ROUTE_NAMES = Object.keys(AI_ROUTES) as AiRouteName[];

// ---------------------------------------------------------------------------
// 層3: 機能 → ルート  ★これが一覧表の本体★
//
// 上書き:  AI_ROUTE_<キー名>=<ルート名>   例) AI_ROUTE_BSKY_CONVERSATION=flash-standard
// 各既定値は「リファクタ前の実効挙動」をそのまま写したもの。
// ---------------------------------------------------------------------------

export const AI_FEATURES = {
  // ══════ Bluesky 全肯定botたん ══════════════════════════════════════
  BSKY_AFFIRMATIVE_REPLY: "lite-standard", // 通常AIリプライ（スコア付き）
  BSKY_CONVERSATION: "flash-auto", // 会話モード（chats.create）
  BSKY_ANALYZE: "lite-flex", // botたん分析
  BSKY_FORTUNE: "lite-flex", // 占い
  BSKY_USER_DIARY: "lite-flex", // ユーザ日記 本文
  BSKY_USER_DIARY_EMOJI: "lite-standard", // ユーザ日記 絵文字の選び直し
  BSKY_BOT_DIARY: "lite-auto", // botたん自身の日記
  BSKY_GOOD_NIGHT: "lite-auto", // おやすみポスト
  BSKY_QUESTION: "lite-auto", // 質問生成
  BSKY_QUESTIONS_ANSWER: "lite-flex", // 質問への回答
  BSKY_MY_MOOD_SONG: "lite-auto", // 今日の気分ソング
  BSKY_RECOMMENDED_SONG: "lite-flex", // おすすめソング
  BSKY_IMAGE: "image-auto", // 画像生成
  BSKY_WHIMSICAL_POST_PLAN: "flash-auto", // 気まぐれ投稿: 企画フェーズ
  BSKY_WHIMSICAL_POST_WRITE: "flash-auto", // 気まぐれ投稿: 執筆フェーズ
  BSKY_WHIMSICAL_REPLY: "lite-flex", // 気まぐれ投稿へのリプライ
  BSKY_CHEER_SUBJECT: "lite-flex", // 応援対象かどうかの判定
  BSKY_CHEER_RESULT: "lite-flex", // 応援メッセージ
  BSKY_OMIKUJI: "lite-flex", // おみくじ
  BSKY_ANNIVERSARY: "lite-flex", // 記念日
  BSKY_RECAP: "lite-flex", // 1年のまとめ
  BSKY_ROOM_WELCOME: "lite-flex", // お部屋招待のお出迎えメッセージ
  BSKY_BIORHYTHM_STATUS: "lite-auto", // botたんの現在状況（三人称の描写文）

  // ══════ Nagi ═══════════════════════════════════════════════════════
  NAGI_REPLY_ATTEMPT_EARLY: "lite-flex", // リプライ 1〜2回目
  NAGI_REPLY_ATTEMPT_MID: "lite-standard", // リプライ 3〜4回目
  NAGI_REPLY_ATTEMPT_LATE: "flash-standard", // リプライ 5回目以降 + 会話は初回から
  NAGI_ANALYSIS: "lite-flex", // 自動アクター分析
  NAGI_CARD_COMMENT: "lite-standard", // カードのbotたんコメント
  NAGI_COMMUNITY_AFFIRMATION: "lite-flex", // コミュニティ全肯定
  NAGI_CHANNEL_WELCOME: "lite-flex", // チャンネル作成時の歓迎
  NAGI_CHANNEL_TOPIC: "lite-flex", // チャンネルへの話題ふり

  // ══════ ニュース ═══════════════════════════════════════════════════
  NEWS_POSITIVE_GATE: "lite-auto", // ポジニュース判定（構造化JSON）
  NEWS_POSITIVE_COMMENT: "lite-auto", // ポジニュースのbotたんコメント

  // ══════ ローカル Ollama（ServiceTier なし） ════════════════════════
  OLLAMA_PREDEFINED_AFFIRMATION: "ollama-chat", // 定型文リプライの分類/選択/翻訳
  OLLAMA_NEWS_PRESCREEN: "ollama-chat", // ニュースの事前スクリーニング
  OLLAMA_EMBED: "ollama-embed", // 埋め込み（投稿/ユーザ/チャンネル/ニュース）
  OLLAMA_TRANSLATION: "ollama-translate", // 投稿の一般翻訳
  OLLAMA_BOT_TRANSLATION: "ollama-bot-translate", // botたん投稿のペルソナ翻訳
} as const satisfies Record<string, AiRouteName>;

export type AiFeatureKey = keyof typeof AI_FEATURES;

export const AI_FEATURE_KEYS = Object.keys(AI_FEATURES) as AiFeatureKey[];

// ---------------------------------------------------------------------------
// リゾルバ（遅延解決 + メモ化）
// ---------------------------------------------------------------------------

export type ResolvedAiRoute = {
  feature: AiFeatureKey;
  route: AiRouteName;
  provider: AiProvider;
  model: string;
  /** undefined = serviceTier を送らない（ルートが "auto" のとき） */
  serviceTier?: "flex" | "standard";
  /** 既定値か env 上書きか、env が不正でフォールバックしたか */
  source: "default" | "env" | "env-invalid";
};

let cache: Map<AiFeatureKey, ResolvedAiRoute> | undefined;

function isAiRouteName(value: string): value is AiRouteName {
  return Object.prototype.hasOwnProperty.call(AI_ROUTES, value);
}

export function aiRouteEnvName(feature: AiFeatureKey): string {
  return `AI_ROUTE_${feature}`;
}

function resolveUncached(feature: AiFeatureKey): ResolvedAiRoute {
  let route: AiRouteName = AI_FEATURES[feature];
  let source: ResolvedAiRoute["source"] = "default";

  const raw = process.env[aiRouteEnvName(feature)]?.trim();
  if (raw) {
    if (isAiRouteName(raw)) {
      route = raw;
      source = "env";
    } else {
      // 24時間動き続けるbotをタイポで落とさない。warn して既定にフォールバックし、
      // 起動時の logAiRouteTable() でまとめて目立たせる。
      source = "env-invalid";
      console.warn(
        `[WARN][AI_ROUTE] ${aiRouteEnvName(feature)}="${raw}" は未知のルート名。既定 "${route}" を使う。` +
          ` 有効な値: ${AI_ROUTE_NAMES.join(", ")}`,
      );
    }
  }

  const spec: AiRouteSpec = AI_ROUTES[route];
  const alias = MODEL_ALIAS_SPECS[spec.alias];
  const model = process.env[alias.env]?.trim() || alias.fallback();

  return {
    feature,
    route,
    provider: spec.provider,
    model,
    ...(spec.tier === "auto" ? {} : { serviceTier: spec.tier }),
    source,
  };
}

/** 機能キーから、実際に使うモデルと ServiceTier を解決する。初回呼び出し時に解決してメモ化。 */
export function resolveAiRoute(feature: AiFeatureKey): ResolvedAiRoute {
  if (!cache) cache = new Map();
  let hit = cache.get(feature);
  if (!hit) {
    hit = resolveUncached(feature);
    cache.set(feature, hit);
  }
  return hit;
}

/** 機能キー → 実モデルID。DBに記録する model カラムもこれを使う。 */
export function aiModel(feature: AiFeatureKey): string {
  return resolveAiRoute(feature).model;
}

/** 機能キー → ServiceTier。undefined なら送らない。 */
export function aiServiceTier(feature: AiFeatureKey): "flex" | "standard" | undefined {
  return resolveAiRoute(feature).serviceTier;
}

/** テスト用。process.env を書き換えたあとに呼ぶ。 */
export function resetAiRouteCache(): void {
  cache = undefined;
}

/**
 * 起動時に1回だけ、解決済みの割り当て表をログに出す。
 * dotenv.config() の「後」に呼ぶこと。
 * prefixes を渡すと、そのアプリが使う機能だけに絞れる（例: ["BSKY_", "OLLAMA_"]）。
 */
export function logAiRouteTable(options: { prefixes?: string[] } = {}): void {
  const { prefixes } = options;
  const keys = AI_FEATURE_KEYS.filter(
    (key) => !prefixes?.length || prefixes.some((prefix) => key.startsWith(prefix)),
  );
  const rows = keys.map((key) => {
    const resolved = resolveAiRoute(key);
    return {
      feature: key,
      route: resolved.route,
      model: resolved.model,
      tier: resolved.serviceTier ?? "(auto)",
      source: resolved.source,
    };
  });

  console.log("[INFO][AI_ROUTE] resolved AI routing table");
  console.table(rows);

  const invalid = rows.filter((row) => row.source === "env-invalid");
  if (invalid.length) {
    console.warn(
      `[WARN][AI_ROUTE] 無効な AI_ROUTE_* が ${invalid.length} 件あり既定にフォールバックした:`,
      invalid.map((row) => row.feature).join(", "),
    );
  }
}
