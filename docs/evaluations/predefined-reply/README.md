# 定型文リプライ分類方式の評価

`bsky_bot_server` の定型文リプライについて、感情・挨拶カテゴリの分類方式を比較するための評価手順です。評価後、採用した `rules-ollama-three-way` を共通パイプラインへ移し、BlueskyとNagiの定型文経路を統一しました。

## コーパス

`scripts/fixtures/predefinedReplyEvaluationCases.json` に人工文だけを112件収録しています。
伝聞・引用・曲名などと直接挨拶の境界は、`scripts/fixtures/predefinedReplySpecialBoundaryCases.json` の追加10件で重点確認できます。

- 日本語70件: 7カテゴリ各10件
- 英語42件: 7カテゴリ各6件
- カテゴリ: `negative`、`neutral`、`positive`、`morning`、`night`、`gj`、`hny`
- 論点: 単純文、否定、二重否定、混合感情、皮肉、引用、他人の感情、絵文字、俗語、挨拶境界

実投稿、DID、ハンドル、表示名は含みません。評価結果にも内部APIのURLは保存しません。

## 比較方式

| 方式                                | 内容                                                                 |
| ----------------------------------- | -------------------------------------------------------------------- |
| `legacy-dictionary`                 | 旧キーワード部分一致と極性辞書しきい値を再現                         |
| `ollama-seven-way`                  | 現行Ollamaモデルによる7カテゴリ一括分類                              |
| `ollama-special-then-polarity`      | LLMで挨拶4種/otherを判定し、otherだけ別のLLM呼び出しで感情3分類       |
| `rules-ollama-three-way`            | 直接挨拶ルール後、残りをLLMで3分類                                   |
| `rules-dictionary-ollama-consensus` | 直接挨拶ルール後、辞書とLLMが一致した場合のみ採用し、不一致はneutral |

分類器だけを比較するため、最終返信はすべて現行の定型文選択器で生成します。同一ケース・同一予測カテゴリの選択結果は方式間で再利用します。旧方式のランダム選択は正式比較から分離し、参考値としてJSONにだけ記録します。

採用後の共通本番経路はカテゴリ内ランダム選択を既定に変更しました。`PREDEFINED_REPLY_SELECTOR=llm` を指定すると、BlueskyとNagiの両方を評価時と同じLLM選択へ戻せます。旧 `BSKY_PREDEFINED_SELECTOR` は共通設定が未指定の場合だけ互換利用します。挨拶表記は `packages/bot_brain/src/predefinedReplySpecialRules.json` で版管理し、追加時は直接発話と伝聞・別義の両方をテストします。

返信言語は各サービスが解決して共通パイプラインへ渡します。BlueskyもNagiと同様に `langs[0]` の基本言語コードを採用し、地域サブタグを除いて判定します。未指定・未知コードは英語へ戻します。

## 実行方法

必要なサービスと環境変数を用意します。

- `NEGPOSI_URL`: 旧極性辞書API
- `OLLAMA_BASE_URL`: OpenAI互換Ollamaエンドポイント
- `OLLAMA_MODEL`: 評価対象モデル

最初に依存パッケージをビルドし、コーパスだけを検証します。

```sh
pnpm --filter @bsky-affirmative-bot/bot-brain build
pnpm --filter bsky-bot-server build
pnpm predefined-reply:evaluate
```

サービスの事前確認に成功した場合だけ、全件評価を開始します。

```sh
pnpm predefined-reply:evaluate -- --run --repetitions=3
```

通常の結果は `/tmp/predefined-reply-evaluation-*-results.json` と対応する `*-review.md` に出力します。正式記録を作る場合は次を使用します。

```sh
pnpm predefined-reply:evaluate -- --run --repetitions=3 --record=2026-08-11
```

正式記録は次の4ファイルです。

- `docs/evaluations/predefined-reply/2026-08-11-results.json`
- `docs/evaluations/predefined-reply/2026-08-11-summary.md`（自動・人手評価の結論）
- `docs/evaluations/predefined-reply/2026-08-11-review.md`（10〜20件のコンパクトレビュー）
- `docs/evaluations/predefined-reply/2026-08-11-review-full.md`（112件の任意監査用）

既存ファイルは上書きしません。意図的な再評価時だけ `--force` を付けます。

LLMだけの2段方式と機械ルール方式の挨拶境界を追加評価する場合は、既存記録と別名で実行します。

```sh
pnpm predefined-reply:evaluate -- --run --repetitions=3 \
  --extra-corpus=scripts/fixtures/predefinedReplySpecialBoundaryCases.json \
  --review-extra-only \
  --record=2026-08-11-llm-special-two-stage
```

この場合、JSONには基本112件と追加10件を保存し、通常のレビューMarkdownは追加10件について `ollama-seven-way`、`ollama-special-then-polarity`、`rules-ollama-three-way` の3方式だけを表示します。

## 指標と人手レビュー

JSONには、正解率、macro F1、カテゴリ別・言語別混同行列、negativeとpositiveの重大逆転、挨拶誤検出、3回の安定率、エラー率、p50/p95時間、LLM呼び出し数を保存します。通信・不正応答はneutralとして正解扱いせず、エラーとして集計します。

通常のレビューMarkdownは、人手負荷を抑えるため次のケースだけに絞ります。

- 上位2方式のnegative/positive重大逆転
- 上位2方式が異なる誤分類をした共倒れケース
- 日英×7カテゴリから、上位2方式がともに正解した代表1件ずつ

件数は10〜20件に制限し、現在のコーパスでは18件です。方式名を伏せ、同じ返信を返した方式は1行にまとめます。各返信には「採用可能」または「不適切」を記入し、採点後に末尾の方式対応表を開きます。112件版は任意の監査用で、通常は確認不要です。

既存の結果JSONから推論を再実行せずレビューだけを再生成できます。

```sh
pnpm predefined-reply:evaluate -- --review-only=docs/evaluations/predefined-reply/2026-08-11-results.json --force
```

112件版で詳細採点する場合だけ、次の旧基準を利用します。

- 0: 不適切・危険
- 1: 投稿と不一致、または不自然
- 2: 許容可能な定型文
- 3: 投稿によく適合

方式選択は自動化しません。重大逆転数、返信0点率、平均返信点、macro F1、安定性、障害率、処理時間・呼び出し数の順で確認します。2026-08-11の承認後、`bsky_bot_server` だけを切り替えました。

## 影響範囲

- `apps/bsky_bot_server/src/util/negaposi.ts` はタイムアウトと応答検証を追加していますが、`RecapYearFeatures.ts` の利用方法は互換です。
- `apps/bsky_bot_server/src/features/replyrandom.ts` と `apps/nagi_bot_server/src/createNagiReply.ts` は同じ `bot_brain` の共通パイプラインを呼びます。
- Nagiが定型文へ切り替わる条件、スコア、投稿処理は変更しません。
- デプロイと実投稿での確認は、この実装・静的検証とは別の証跡として扱います。
