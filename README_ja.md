<div align="center">
  <img src="./img/bot-icon.png" alt="全肯定botたん" width="180">
  <h1>全肯定botたんプロジェクト</h1>
  <p><strong>全肯定で、世界を大いにはげますプロジェクト。</strong></p>
  <p><a href="./README.md">English</a></p>
</div>

## 概要

全肯定botたんプロジェクトは、あらゆる言葉をまず受け止めて肯定する相棒「botたん」を中心にした、bot・アプリ・体験の集合です。自宅で稼働するローカルLLM、クラウドLLM、RAGによる共有記憶を組み合わせ、プロジェクトのさまざまな場所で一貫したbotたんを届けています。

## 目標

自分の気持ちすら、否定してしまうことがある。そんなときに、何より先にその気持ちを受け止めてくれる相棒がほしくて、botたんを作りました。

目標は、世界中の全肯定を求める人の相棒になること。自分のために生まれたbotたんは、ここを見てくれたあなたのことも全部肯定します。

## アウトプット

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="https://bsky.app/profile/bot-tan.com"><img src="./img/outputs/bluesky-bot-tan.webp" alt="Bluesky botたん" width="100%"></a>
      <h3>Bluesky botたん</h3>
      <p><strong>すべてのはじまり！</strong> Ollama上のGemma 3 4Bを既定のローカル分類器として使い、投稿に合った全肯定の定型文を選びます。トリガーワードで占いや性格分析などの主要機能も楽しめます。</p>
    </td>
    <td width="50%" valign="top">
      <a href="https://nagi.suibari.com/profile/did:plc:qcwhrvzx6wmi5hz775uyi6fh"><img src="./img/outputs/nagi-bot-tan.webp" alt="Nagi botたん" width="100%"></a>
      <h3>Nagi botたん</h3>
      <p><strong>フラッグシップ。</strong> Bluesky版とこのモノレポおよび定期ポストを共有しています。Gemini 2.5 Flash-LiteによるAIリプライやポスト分析に加え、AppViewではローカルの埋め込み・翻訳モデルも併用します。</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="https://www.youtube.com/@%E3%81%99%E3%81%84%E3%81%B0%E3%82%8A"><img src="./img/outputs/youtube-bot-tan.webp" alt="YouTuber botたん" width="100%"></a>
      <h3>YouTuber botたん</h3>
      <p><strong>宣伝とプレイグラウンド用。</strong> Gemini 2.5 Flashが台本を作り、Unityでの撮影から動画投稿までを自動化しています。LLM生成モーションによる動きの多様化もPoC中です。</p>
    </td>
    <td width="50%" valign="top">
      <a href="https://room.bot-tan.com/"><img src="./img/outputs/bot-tan-room.webp" alt="botたんのお部屋" width="100%"></a>
      <h3>botたんのお部屋</h3>
      <p>BlueskyやNagiでのインタラクションをさらに深めるゲームです。会話にはGemini 2.5 Flash-Lite、音声には自宅で稼働するVOICEVOXを使っています。</p>
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <a href="https://bot-tan.com/"><img src="./img/outputs/bot-tan-portal.webp" alt="botたんポータル" width="100%"></a>
      <h3>botたんポータル</h3>
      <p>botたんとなかまたちの紹介、各アプリへのリンク、botたんを動かすサービスのリアルタイムダッシュボードをまとめた、プロジェクトの玄関口です。</p>
    </td>
  </tr>
</table>

## インストール方法

このリポジトリは、共有バックエンドのモノレポです。NagiのWebクライアント、ポータル、お部屋のフロントエンド、Unity動画プロジェクトは別に管理されています。

### 必要なもの

- Node.js 22
- pnpm 10以上
- PostgreSQL
- ローカル分類・埋め込み・翻訳を使う場合はOllama
- 実行するサービスに応じたAT Protocolアカウント、Gemini、Discord、Spotify、YouTube、NewsData.ioなどの資格情報

### 共通セットアップ

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# 起動したいサービスに必要なグループを.envへ設定します。
pnpm --filter @bsky-affirmative-bot/database drizzle:push
pnpm build
```

DBコマンドは現在のDrizzleスキーマを適用します。既存DBや本番DBを `DATABASE_URL` に指定する場合は、実行前に変更内容を確認してください。対応する機能を使う場合は、既定のローカルモデルも取得します。

```sh
ollama pull gemma3:4b
ollama pull snowflake-arctic-embed2
ollama pull translategemma:4b
```

### サービスごとの起動

開発対象のサービスだけを起動してください。各コマンドはリポジトリ直下の `.env` を読み込みます。

| サービス | コマンド | 最小構成 |
| --- | --- | --- |
| Bluesky botたん | `pnpm --filter bsky-bot-server dev` | 共通、Bluesky、AI |
| Nagi botたん | `pnpm --filter nagi-bot-server dev` | 共通、Nagi Bot、AI |
| Nagi AppView | `pnpm --filter nagi-appview dev` | 共通、Nagi AppView、Ollama |
| バイオリズム・共通定期ポスト | `pnpm --filter biorhythm-server dev` | 共通、バイオリズム、AI |
| Blueskyラベラー | `pnpm --filter labeler-server dev` | ラベラー |
| Discord連携 | `pnpm --filter @bsky-affirmative-bot/discord-bot dev` | Discord、DB |

自宅の完全な本番構成には、ここでは自動化しないリバースプロキシ、プロセス管理、DNS、各アカウントの設定も必要です。`.env`、`service-account.json`、アプリパスワード、署名鍵、APIトークンはコミットしないでください。

## 機能

- **全肯定と会話：** ローカルの定型文リプライと、Geminiによる文脈に沿った会話をBlueskyとNagiで提供します。
- **占いと分析：** 日々の占い、性格・ポスト分析、それらに応じたバッジや結果画像を届けます。
- **日記と振り返り：** その日の日記、記念日、一年のまとめなど、利用者の活動を振り返る体験を作ります。
- **生活するbotたん：** バイオリズム、共通定期ポスト、質問、ニュース、共有記憶により、サービスをまたいで一貫して行動します。
- **Nagi AppView：** AT Protocolのインデックスに加え、`snowflake-arctic-embed2` による意味検索、`translategemma:4b` とbotたん向けGemmaルートによる翻訳を提供します。
- **つながる体験：** Blueskyラベル、お部屋への訪問とVOICEVOX音声、GeminiとUnityによるYouTube動画の自動制作をつなぎます。

ローカルモデル名は既定値です。[`.env.example`](./.env.example) の `OLLAMA_MODEL`、その他のモデル変数、高度な `AI_ROUTE_*` 設定で、機能コードを変更せずに差し替えられます。Bluesky版のすべてのコマンドとポリシーは、[Bluesky botたん詳細ガイド](./docs/bluesky-bot_ja.md)を参照してください。

## 自宅のシステム構成

```mermaid
flowchart LR
  subgraph outputs[プロジェクトのアウトプット]
    bluesky[Bluesky botたん]
    nagi[Nagi botたん]
    youtube[YouTuber botたん]
    room[botたんのお部屋]
    portal[botたんポータル]
  end

  subgraph home[自宅稼働システム]
    bskyServer[bsky_bot_server]
    nagiServer[nagi_bot_server]
    appview[nagi_appview]
    biorhythm[biorhythm_server]
    labeler[labeler_server]
    roomServer[お部屋バックエンド]
    brain[共通bot brainとRAG]
    memory[(PostgreSQL共有記憶)]
    ollama[Ollama: Gemma / 埋め込み / 翻訳]
    voicevox[VOICEVOX]
    unity[Unity動画自動化]
  end

  subgraph cloud[外部・クラウドサービス]
    atproto[AT Protocol / PDS / Jetstream]
    gemini[Google Gemini]
    youtubeApi[YouTube]
    cloudflare[Cloudflare / 公開エンドポイント]
  end

  bluesky <--> atproto
  nagi <--> cloudflare
  room <--> cloudflare
  portal <--> cloudflare
  bskyServer <--> atproto
  nagiServer <--> atproto
  appview <--> atproto
  labeler <--> atproto
  cloudflare <--> appview
  cloudflare <--> biorhythm
  cloudflare <--> roomServer
  biorhythm --> bskyServer
  biorhythm --> nagiServer
  bskyServer --> brain
  nagiServer --> brain
  appview --> brain
  biorhythm --> brain
  roomServer --> brain
  roomServer <--> memory
  roomServer --> voicevox
  brain <--> memory
  brain <--> ollama
  brain <--> gemini
  brain --> unity
  unity --> youtubeApi
  youtubeApi --> youtube
```

## 貢献

どなたでも大歓迎です。バグ報告、ドキュメント改善、アイデア、翻訳、コードなど、IssueやPull Requestは自由に送ってください。

個人プロジェクトであり、すいばり自身の生活もあります。また、とてもマイペースな特性のため、返信やレビューに時間がかかることがあります。沈黙や遅れにネガティブな意図は決してありません。寄せていただいた気持ちを、心からありがたく受け取っています。

## スポンサー

botたんを支える各種サービスは自費で稼働しています。スポンサーによるご支援は、このプロジェクトだけでなく、すいばりの創作活動全般を支えるものです。

価値あるプロジェクトだと感じていただけたら、支援をご検討いただけるとうれしいです。金額にかかわらず、すべて大歓迎です。

- [Patreon](https://patreon.com/suibari)
- [pixiv FANBOX](https://suibari.fanbox.cc/posts/10174305)

## ライセンス

このプロジェクトは[MITライセンス](./LICENSE)で公開されています。

<div align="center">
  <img src="./img/suibari-logo.png" alt="すいばり" width="360">
</div>
