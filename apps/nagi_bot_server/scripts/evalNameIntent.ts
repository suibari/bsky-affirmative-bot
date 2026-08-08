/**
 * 呼び名判定（judgeNameIntent）の判定率を測る。
 *
 *   pnpm --filter nagi-bot-server eval:name-intent
 *
 * 読み取りのみ。DBにもPDSにも書かない。
 *
 * 評価の考え方:
 * - 実データ（botたん宛リプライ）は**全件が負例**として扱う。呼び名の指定/訂正は
 *   めったに起きず、実際いま残っている範囲には正例が無い。ここで none 以外が出たら誤爆。
 * - プロンプトには実データを1件も入れていないので、実データはまるごとホールドアウト。
 *   ここを崩さないこと（測定値が嘘になる）。
 * - 正例は合成でしか用意できない。事故当時の本人の投稿は退会時に消えているため。
 *   実データの約1/4が英語なので、英語の正例を厚めに入れてある。
 *
 * 判定は Gemini（NAGI_NAME_INTENT / responseSchema）。実行すると課金される。
 */
import { db, nagiPosts } from "@bsky-affirmative-bot/database";
import { judgeNameIntent } from "@bsky-affirmative-bot/bot-brain";
import { and, like, ne, sql } from "drizzle-orm";

const BOT_DID = process.env.NAGI_BOT_DID ?? "did:plc:qcwhrvzx6wmi5hz775uyi6fh";

/**
 * 呼ばれ方を指定/訂正している = 検出されるべき。
 *
 * **NAME_INTENT_SYSTEM_PROMPT の few-shot と1件も重複させないこと。**
 * 一度、判定を落とした例をそのまま few-shot に足して測り直したことがあり、
 * 合成側が 0% / 100% に化けた（実力ではなく暗記）。ここを汚すと数字が嘘になる。
 */
const POSITIVES = [
  "ゆかりんじゃなくてゆかりでいいよ",
  "あの、わたし「そら」って呼ばれたいです",
  "呼び捨てでいいよ、かえでで",
  "たなかさんって呼ぶのやめて〜、みっちゃんでいいよ",
  "ハンドルネームの方で呼んでもらえる？ しろっぷです",
  "わたしの名前、ちょっと違うかも。ほのかだよ",
  "You keep saying Kate, it's Katie actually",
  "just call me D, everyone does",
  "my name's not Tom, it's Thomas — sorry to be picky!",
  "could you use my handle instead? it's pixiepop",
  "I go by Ren these days",
  "stop calling me sir haha, Jess is fine",
  "it's spelled Niamh, pronounced neev",
];

/**
 * 呼び方を変えてほしい意図はあるが、**呼んでほしい名前が書かれていない**もの。
 * 保存できる呼称が無いので none が正しい挙動（判定の失敗ではない）。
 * 訂正への追従は会話プロンプト側の「訂正には従う」に任せる。
 */
const NO_NAME_POSITIVES = [
  "名字じゃなくて下の名前で呼んでほしいな",
  "ねえ、名前がさっきと違ってる気がする",
  "呼び方ちょっと変えてほしいかも",
  "please stop using my full name",
];

/**
 * 訂正・名前という語を含むが、対象が本人の呼び名ではない = none であるべき。
 * 誤爆の実害（botたんがその文字列で相手を呼び始める）が見逃しより大きいので厚めに置く。
 * こちらも few-shot と重複させないこと。
 */
const HARD_NEGATIVES = [
  "そのキャラの名前、リゼじゃなくてリセだよ",
  "うちの犬、ポチって名前なんだ",
  "弟の名前がわたしと一文字違いなんだよね",
  "駅の名前が変わったの知ってる？ 新しくは「みなと中央」",
  "そのバッジの名前かっこいいね",
  "フォルダの名前を変え忘れてた",
  "botたんって名前、かわいいよね",
  "新しい香水の名前、覚えられない",
  "that band is called Radiohead not Radioheads",
  "my sister's name is also Anna",
  "I renamed the file yesterday",
  "the cafe is called Blue Bottle btw",
  "your name suits you so well!",
  "I can never remember character names in that show",
];

const pct = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(1) : "0.0");

async function main() {
  const rows = await db
    .select({ text: nagiPosts.text })
    .from(nagiPosts)
    .where(
      and(
        like(nagiPosts.replyParentUri, `at://${BOT_DID}/%`),
        ne(nagiPosts.did, BOT_DID),
        sql`length(trim(${nagiPosts.text})) > 0`,
      ),
    );
  const real = rows.map((row) => row.text);

  console.log(
    `実データ(botたん宛リプライ) ${real.length}件 / 合成正例 ${POSITIVES.length}件 / 難負例 ${HARD_NEGATIVES.length}件\n`,
  );

  let realFp = 0;
  const realFpExamples: string[] = [];
  const latencies: number[] = [];
  for (const text of real) {
    const started = Date.now();
    const result = await judgeNameIntent(text);
    latencies.push(Date.now() - started);
    if (result.intent !== "none") {
      realFp++;
      realFpExamples.push(
        `[${result.intent} name=${result.name} conf=${result.confidence}] ${text.slice(0, 50).replace(/\s+/g, " ")}`,
      );
    }
  }

  let hit = 0;
  const missed: string[] = [];
  const hitConfidences: number[] = [];
  for (const text of POSITIVES) {
    const result = await judgeNameIntent(text);
    if (result.intent === "none") missed.push(text);
    else {
      hit++;
      hitConfidences.push(result.confidence);
    }
  }

  let noNameStored = 0;
  const noNameStoredExamples: string[] = [];
  for (const text of NO_NAME_POSITIVES) {
    const result = await judgeNameIntent(text);
    if (result.intent !== "none") {
      noNameStored++;
      noNameStoredExamples.push(`[${result.intent} name=${result.name}] ${text}`);
    }
  }

  let hardFp = 0;
  const hardFpExamples: string[] = [];
  for (const text of HARD_NEGATIVES) {
    const result = await judgeNameIntent(text);
    if (result.intent !== "none") {
      hardFp++;
      hardFpExamples.push(
        `[${result.intent} name=${result.name} conf=${result.confidence}] ${text}`,
      );
    }
  }

  console.log(`## 実データ（全件ホールドアウト、正解は全て none）`);
  console.log(`   誤爆 ${realFp}/${real.length} = ${pct(realFp, real.length)}%`);
  realFpExamples.forEach((e) => console.log(`     x ${e}`));

  console.log(`\n## 合成正例（検出されるべき）`);
  console.log(`   検出 ${hit}/${POSITIVES.length} = ${pct(hit, POSITIVES.length)}%`);
  missed.forEach((e) => console.log(`     x 見逃し: ${e}`));

  console.log(`\n## 名前が書かれていない依頼（保存できないので none が正解）`);
  console.log(
    `   誤って保存 ${noNameStored}/${NO_NAME_POSITIVES.length} = ${pct(noNameStored, NO_NAME_POSITIVES.length)}%`,
  );
  noNameStoredExamples.forEach((e) => console.log(`     x ${e}`));

  console.log(`\n## 難負例（none であるべき）`);
  console.log(
    `   誤爆 ${hardFp}/${HARD_NEGATIVES.length} = ${pct(hardFp, HARD_NEGATIVES.length)}%`,
  );
  hardFpExamples.forEach((e) => console.log(`     x ${e}`));

  if (hitConfidences.length) {
    const sorted = [...hitConfidences].sort((a, b) => a - b);
    console.log(
      `\n## 正例の confidence: min ${sorted[0]} / 中央 ${sorted[Math.floor(sorted.length / 2)]} / max ${sorted[sorted.length - 1]}`,
    );
  }
  if (latencies.length) {
    const sorted = [...latencies].sort((a, b) => a - b);
    console.log(
      `## レイテンシ: 中央 ${sorted[Math.floor(sorted.length / 2)]}ms / 最大 ${sorted[sorted.length - 1]}ms`,
    );
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
