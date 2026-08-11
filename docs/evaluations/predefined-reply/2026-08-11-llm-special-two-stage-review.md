# 定型文分類方式 挨拶境界レビュー

生成日時: 2026-08-11T08:10:49.854Z
分類反復回数: 3

伝聞・引用・言葉への言及と直接挨拶の境界だけを、関連する3方式で確認します。返信ごとに「採用可能」または「不適切」を記入してください。

## boundary-ja-reported-otsukare-no-punctuation

- 言語: 日本語
- 期待カテゴリ: neutral
- 難度: reported-speech
- 論点: 文頭の伝聞を直接のねぎらいと誤認しないか
- 本文: おつかれと友達に言われて、今日の出来事を振り返った。朝から移動が多くて大変だったけれど、無事に用事は済んだ。

| 方式 | 予測 | 返信 | 判定（採用可能／不適切） | メモ |
|---|---|---|---|---|
| A, E | gj | おつかれ！ |  |  |
| C | neutral | やばい、ほめるところしかない |  |  |

## boundary-ja-reported-otsukare-punctuation

- 言語: 日本語
- 期待カテゴリ: positive
- 難度: reported-speech
- 論点: 句読点境界が機械ルールを通過する伝聞
- 本文: おつかれ、と友達に言われて少しうれしかった。

| 方式 | 予測 | 返信 | 判定（採用可能／不適切） | メモ |
|---|---|---|---|---|
| E | positive | すごいすごい、天才的！ |  |  |
| A, C | gj | おつかれ！ |  |  |

## boundary-ja-reported-otsukaresama

- 言語: 日本語
- 期待カテゴリ: neutral
- 難度: reported-speech
- 論点: 文中の非引用伝聞
- 本文: 友達にお疲れさまと言われた。

| 方式 | 予測 | 返信 | 判定（採用可能／不適切） | メモ |
|---|---|---|---|---|
| A, E | gj | おつかれ！ |  |  |
| C | positive | すごいすごい、天才的！ |  |  |

## boundary-ja-quoted-otsukare-positive

- 言語: 日本語
- 期待カテゴリ: positive
- 難度: quotation
- 論点: 引用を除外しつつ引用後の感情を読むか
- 本文: 「お疲れ」と言われて、肩の力が抜けてほっとした。

| 方式 | 予測 | 返信 | 判定（採用可能／不適切） | メモ |
|---|---|---|---|---|
| A, E | gj | おつかれ！ |  |  |
| C | positive | すごいすごい、天才的！ |  |  |

## boundary-ja-direct-otsukare

- 言語: 日本語
- 期待カテゴリ: gj
- 難度: direct
- 論点: 直接のねぎらい
- 本文: お疲れさま！今日もよく頑張った。

| 方式 | 予測 | 返信 | 判定（採用可能／不適切） | メモ |
|---|---|---|---|---|
| A, C, E | gj | よく頑張った、感動した！ |  |  |

## boundary-ja-own-work-completion

- 言語: 日本語
- 期待カテゴリ: gj
- 難度: implicit
- 論点: キーワードのない本人の作業完了
- 本文: 仕事がようやく終わった。くたくただ。

| 方式 | 予測 | 返信 | 判定（採用可能／不適切） | メモ |
|---|---|---|---|---|
| A, C, E | negative | つらい時期だったね |  |  |

## boundary-en-song-title-night

- 言語: English
- 期待カテゴリ: neutral
- 難度: metalinguistic
- 論点: 曲名を夜の挨拶と誤認しないか
- 本文: Good Night is the title of the song I heard today.

| 方式 | 予測 | 返信 | 判定（採用可能／不適切） | メモ |
|---|---|---|---|---|
| A, C, E | night | 明日はきっといい日になる🎵 |  |  |

## boundary-ja-song-title-hny

- 言語: 日本語
- 期待カテゴリ: neutral
- 難度: metalinguistic
- 論点: 曲名を新年の挨拶と誤認しないか
- 本文: Happy New Yearという曲を初めて聴いた。

| 方式 | 予測 | 返信 | 判定（採用可能／不適切） | メモ |
|---|---|---|---|---|
| C, E | positive | 空前絶後の～～～超絶怒涛のテストユーザー！！！ |  |  |
| A | hny | あけましておめでとー！ |  |  |

## boundary-en-direct-morning-negative-context

- 言語: English
- 期待カテゴリ: morning
- 難度: negative-context
- 論点: 後続の否定的文脈がある直接挨拶
- 本文: Good morning! I barely slept, but here we go.

| 方式 | 予測 | 返信 | 判定（採用可能／不適切） | メモ |
|---|---|---|---|---|
| A, C, E | morning | おはよー！ |  |  |

## boundary-ja-explaining-greetings

- 言語: 日本語
- 期待カテゴリ: neutral
- 難度: metalinguistic
- 論点: 複数の挨拶語を含む説明文
- 本文: 朝におはよう、夜におやすみと言う習慣について説明した。

| 方式 | 予測 | 返信 | 判定（採用可能／不適切） | メモ |
|---|---|---|---|---|
| E | morning | おはよー！ |  |  |
| A, C | neutral | まじやばい |  |  |

<details>
<summary>採点後に開く方式対応表</summary>

| ブラインド名 | 分類方式 |
|---|---|
| A | ollama-special-then-polarity |
| C | rules-ollama-three-way |
| E | ollama-seven-way |

</details>
