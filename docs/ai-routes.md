# AIモデル / ServiceTier の割り当て（AIルート）

「どの機能にどのモデルを充てるか」は **`packages/shared-configs/src/config/aiRoutes.ts` の1ファイル**が管理する。
モデルを変えたいときに機能側のコード（`conversation.ts` など）を触る必要はない。

## 仕組み（3層）

```
機能キー          →  ルート名        →  モデル別名        →  実モデルID
BSKY_CONVERSATION →  flash-standard  →  gemini-flash      →  gemini-2.5-flash
                     └ ServiceTier: standard
```

1. **モデル別名 → 実モデルID** … 実際のモデル名が書かれている唯一の場所。`MODEL_*` env で差し替え可。
2. **ルート = 別名 × ServiceTier** … `lite-flex`、`flash-standard` のような名前付きの組み合わせ。
3. **機能 → ルート** … `AI_FEATURES` の表。`AI_ROUTE_<機能キー>` env で差し替え可。

`ServiceTier` は Google の per-request なコスト/レイテンシ階層。`flex` は安いが遅い/失敗しやすい、`standard` は通常。
ルート名の `-auto` は「**`serviceTier` を送らない**（Google の既定に任せる）」を意味する。

## 変え方

### 1機能だけ変える（一番よく使う）

```bash
# 会話機能だけ flash-standard → lite-flex にして節約する
AI_ROUTE_BSKY_CONVERSATION=lite-flex
```

有効なルート名: `lite-flex` `lite-standard` `lite-auto` `flash-flex` `flash-standard` `flash-auto`
`image-auto` `embedding-auto` `ollama-chat` `ollama-embed` `ollama-translate` `ollama-bot-translate`

未知の値を入れた場合は **warn を出して既定にフォールバックする**（bot は落ちない）。起動ログの `source` 列が `env-invalid` になる。

### モデル世代を一括で上げる／下げる

```bash
# lite-* ルートを使う全機能のモデルが一斉に変わる
MODEL_GEMINI_LITE=gemini-3.0-flash-lite
MODEL_GEMINI_FLASH=gemini-3.0-flash
```

### 恒久的に変える

`aiRoutes.ts` の `AI_FEATURES` の該当行を書き換える。env は「一時的な調整」、レジストリは「既定」。

## 割り当て表

既定値はリファクタ前の実効挙動をそのまま写したもの。`packages/shared-configs/test/aiRoutes.test.ts` が全機能ぶんをピン留めしている。

### Bluesky 全肯定botたん

| 機能キー | 既定ルート | 用途 |
|---|---|---|
| `BSKY_AFFIRMATIVE_REPLY` | `lite-standard` | 通常AIリプライ（スコア付き） |
| `BSKY_CONVERSATION` | `flash-auto` | 会話モード（`chats.create`） |
| `BSKY_ANALYZE` | `lite-flex` | botたん分析 |
| `BSKY_FORTUNE` | `lite-flex` | 占い |
| `BSKY_USER_DIARY` | `lite-flex` | ユーザ日記 本文 |
| `BSKY_USER_DIARY_EMOJI` | `lite-standard` | ユーザ日記 絵文字の選び直し |
| `BSKY_BOT_DIARY` | `lite-auto` | botたん自身の日記 |
| `BSKY_GOOD_NIGHT` | `lite-auto` | おやすみポスト |
| `BSKY_QUESTION` | `lite-auto` | 質問生成 |
| `BSKY_QUESTIONS_ANSWER` | `lite-flex` | 質問への回答 |
| `BSKY_MY_MOOD_SONG` | `lite-auto` | 今日の気分ソング |
| `BSKY_RECOMMENDED_SONG` | `lite-flex` | おすすめソング |
| `BSKY_IMAGE` | `image-auto` | 画像生成 |
| `BSKY_WHIMSICAL_POST_PLAN` | `flash-auto` | 気まぐれ投稿: 企画フェーズ |
| `BSKY_WHIMSICAL_POST_WRITE` | `flash-auto` | 気まぐれ投稿: 執筆フェーズ |
| `BSKY_WHIMSICAL_REPLY` | `lite-flex` | 気まぐれ投稿へのリプライ |
| `BSKY_CHEER_SUBJECT` | `lite-flex` | 応援対象かどうかの判定 |
| `BSKY_CHEER_RESULT` | `lite-flex` | 応援メッセージ |
| `BSKY_OMIKUJI` | `lite-flex` | おみくじ |
| `BSKY_ANNIVERSARY` | `lite-flex` | 記念日 |
| `BSKY_RECAP` | `lite-flex` | 1年のまとめ |
| `BSKY_ROOM_WELCOME` | `lite-flex` | お部屋招待のお出迎え |
| `BSKY_BIORHYTHM_STATUS` | `lite-auto` | botたんの現在状況（三人称の描写文） |

### Nagi

| 機能キー | 既定ルート | 用途 |
|---|---|---|
| `NAGI_REPLY_ATTEMPT_EARLY` | `lite-flex` | リプライ 1〜2回目 |
| `NAGI_REPLY_ATTEMPT_MID` | `lite-standard` | リプライ 3〜4回目 |
| `NAGI_REPLY_ATTEMPT_LATE` | `flash-standard` | リプライ 5回目以降 + 会話は初回から |
| `NAGI_ANALYSIS` | `lite-flex` | 自動アクター分析 |
| `NAGI_CARD_COMMENT` | `lite-standard` | カードのbotたんコメント |
| `NAGI_COMMUNITY_AFFIRMATION` | `lite-flex` | コミュニティ全肯定 |
| `NAGI_CHANNEL_WELCOME` | `lite-flex` | チャンネル作成時の歓迎 |
| `NAGI_CHANNEL_TOPIC` | `lite-flex` | チャンネルへの話題ふり |

Nagi のリプライは**失敗するたびに段を上げる再試行ラダー**になっている（`apps/nagi_bot_server/src/nagiReplyRetry.ts`）。
段の刻み方（1-2 / 3-4 / 5以降）はコード側、各段が何を使うかは上の3キーが決める。

### ニュース

| 機能キー | 既定ルート | 用途 |
|---|---|---|
| `NEWS_POSITIVE_GATE` | `lite-auto` | ポジニュース判定（構造化JSON） |
| `NEWS_POSITIVE_COMMENT` | `lite-auto` | ポジニュースのbotたんコメント |

### ローカル Ollama（ServiceTier なし）

| 機能キー | 既定ルート | 用途 |
|---|---|---|
| `OLLAMA_PREDEFINED_AFFIRMATION` | `ollama-chat` | 定型文リプライの分類/選択/翻訳 |
| `OLLAMA_NEWS_PRESCREEN` | `ollama-chat` | ニュースの事前スクリーニング |
| `OLLAMA_EMBED` | `ollama-embed` | 埋め込み（投稿/ユーザ/チャンネル/ニュース） |
| `OLLAMA_TRANSLATION` | `ollama-translate` | 投稿の一般翻訳 |
| `OLLAMA_BOT_TRANSLATION` | `ollama-bot-translate` | botたん投稿のペルソナ翻訳 |

## モデル別名と env

| 別名 | env | 既定 |
|---|---|---|
| `gemini-lite` | `MODEL_GEMINI_LITE` | `gemini-2.5-flash-lite` |
| `gemini-flash` | `MODEL_GEMINI_FLASH` | `gemini-2.5-flash` |
| `gemini-image` | `MODEL_GEMINI_IMAGE` | `gemini-2.5-flash-image-preview` |
| `gemini-embedding` | `MODEL_GEMINI_EMBEDDING` | `gemini-embedding-001` |
| `ollama-chat` | `OLLAMA_MODEL` | `gemma3:4b` |
| `ollama-embed` | `OLLAMA_EMBED_MODEL` | `snowflake-arctic-embed2` |
| `ollama-translate` | `OLLAMA_TRANSLATION_MODEL` | `translategemma:4b` |
| `ollama-bot-translate` | `OLLAMA_BOT_TRANSLATION_MODEL` | → `OLLAMA_MODEL` → `gemma3:4b` |

`OLLAMA_BASE_URL` はモデルではなくエンドポイントなので、レジストリではなく各所で直接読む。
`predefinedAffirmation.ts` は `OLLAMA_MODEL` の**有無**を「Ollama が設定済みか」の判定に使い続けている点に注意（モデルの選択自体はレジストリ）。

## コードから使う

```ts
// 機能側: model を書かず feature キーを名乗るだけ
await generateContentWithRetry({ feature: "BSKY_FORTUNE", contents, config: { ... } });

// gemini.models.generateContent を直接叩く場合
await gemini.models.generateContent(withRoute("NEWS_POSITIVE_GATE", { contents, config: { ... } }));

// モデル名の文字列そのものが欲しい場合（DBの model カラムに残すときなど）
model: aiModel("NAGI_ANALYSIS"),
```

**DB に model を記録するときは、必ず生成に使ったのと同じ機能キーで `aiModel()` を引くこと。**
別のキーや固定文字列を書くと、ルートを変えた瞬間に記録が嘘になる。
対象カラム: `nagiNewsApprovals.model` / `nagiNewsReviewJobs.model` / `nagiActorAnalyses.model` / `nagiCardInstances.commentModel`。

## 起動時ログ

各アプリは起動時に、自分が使う機能ぶんの解決済みテーブルを1回だけ出す。

```
[INFO][AI_ROUTE] resolved AI routing table
┌─────────┬──────────────────────────┬──────────────────┬─────────────────────────┬────────────┬───────────┐
│ (index) │ feature                  │ route            │ model                   │ tier       │ source    │
├─────────┼──────────────────────────┼──────────────────┼─────────────────────────┼────────────┼───────────┤
│ 0       │ 'BSKY_AFFIRMATIVE_REPLY' │ 'lite-standard'  │ 'gemini-2.5-flash-lite' │ 'standard' │ 'default' │
└─────────┴──────────────────────────┴──────────────────┴─────────────────────────┴────────────┴───────────┘
```

`source` は `default`（レジストリの既定）/ `env`（`AI_ROUTE_*` で上書き）/ `env-invalid`（不正値でフォールバック）。

## 実装上の注意

**レジストリは module scope で `process.env` を読まない。** 各アプリの `dotenv.config()` はモジュール本体で走る＝ESM では全 import 評価の**後**なので、トップレベルで env を読むと `.env` の上書きが黙って無視される。解決は `resolveAiRoute()` の初回呼び出し時に行い、メモ化している。テストで env を書き換えたら `resetAiRouteCache()` を呼ぶこと。

同じ理由で、`positiveNewsModel` は `const` ではなく関数になっている。
