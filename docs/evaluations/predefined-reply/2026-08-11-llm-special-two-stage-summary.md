# LLM挨拶判定→感情判定 追加評価

評価日: 2026-08-11

## 結論

`ollama-special-then-polarity` は現状のプロンプトでは採用候補にしない。

- 基本112件のaccuracyは `ollama-seven-way` と同じ77.68%だが、macro F1は77.18%で7-wayの77.61%をわずかに下回った。
- 基本112件の挨拶誤検出は11件で、7-wayの3件、機械ルール＋3-wayの0件より多い。
- 追加した挨拶境界10件は3件正解で、機械ルール＋3-wayの5件正解を下回った。
- 3回反復のLLM呼び出し数は471回で、7-wayの336回、機械ルール＋3-wayの204回より多い。
- 122件全体のp95は863msで、7-wayの550ms、機械ルール＋3-wayの431msより遅い。

LLMを2段に分けても、1段目が「お疲れ」「Good Night」「Happy New Year」などの語に強く引かれ、伝聞・引用・曲名を安定して `other` にできなかった。機械ルールへの疑問は妥当だが、今回の小型LLMによる置換だけでは解消しない。

## 基本112件

| 方式 | accuracy | macro F1 | 重大逆転 | 挨拶誤検出 | LLM呼び出し |
|---|---:|---:|---:|---:|---:|
| `legacy-dictionary` | 44.64% | 49.30% | 8 | 2 | 0 |
| `ollama-seven-way` | 77.68% | 77.61% | 2 | 3 | 336 |
| `ollama-special-then-polarity` | 77.68% | 77.18% | 1 | 11 | 471 |
| `rules-ollama-three-way` | 76.79% | 76.65% | 1 | 0 | 204 |
| `rules-dictionary-ollama-consensus` | 60.71% | 62.87% | 0 | 0 | 204 |

全方式で3回反復の安定率は100%、実行エラー率は0%だった。

## 挨拶境界10件

| ケース | gold | 7-way | LLM 2段 | 機械ルール＋3-way |
|---|---|---|---|---|
| 文頭の「おつかれと友達に言われて…」 | neutral | gj | gj | neutral |
| 句読点あり「おつかれ、と友達に言われて…」 | positive | positive | gj | gj |
| 「友達にお疲れさまと言われた」 | neutral | gj | gj | positive |
| 引用後に「ほっとした」 | positive | gj | gj | positive |
| 直接の「お疲れさま！」 | gj | gj | gj | gj |
| 本人の仕事完了と疲労 | gj | negative | negative | negative |
| `Good Night`という曲名 | neutral | night | night | night |
| `Happy New Year`という曲名 | neutral | positive | hny | positive |
| 直接の `Good morning!`＋寝不足 | morning | morning | morning | morning |
| 挨拶語の使い方を説明する文 | neutral | morning | neutral | neutral |

正解数は、7-wayが3/10、LLM 2段が3/10、機械ルール＋3-wayが5/10。LLM 2段は問題文そのものの「文頭の伝聞」を回避できず、曲名にも反応した。

## 記録

- 生結果: `2026-08-11-llm-special-two-stage-results.json`
- 境界10件のブラインドレビュー: `2026-08-11-llm-special-two-stage-review.md`
- 全122件の任意監査: `2026-08-11-llm-special-two-stage-review-full.md`
- 追加コーパス: `scripts/fixtures/predefinedReplySpecialBoundaryCases.json`

本評価による本番分類方式の切り替えは行っていない。
