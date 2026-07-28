/**
 * 自動分析（名刺）を手元で強制的に走らせる。
 *
 *   pnpm --filter nagi-bot-server analysis <did> [--source nagi|bluesky] [--sync] [--force]
 *
 * 分析は「初回登録」か「100投稿ごと」でしか発火しないため、名刺のデザインを詰める間に
 * 何度も回せる口が無いと確認しようがない。--sync なら生成結果がそのまま返るので、
 * tagline / tags を目視できる（ワーカーの10秒待ちも無い）。
 *
 * runNagiAnalysis は成功時に AppView へ通知 POST も行うので、--sync 1回で
 * 「分析 → DB upsert → 通知行 → Web Push」を一度に通せる。
 *
 * 実行には bot server が起動していること、および NODE_ENV=development が必要
 * （--sync / --force は本番で開けたくないので、サーバー側で 403 に落とす）。
 */
const args = process.argv.slice(2);
const did = args.find((arg) => arg.startsWith("did:"));
const sourceIndex = args.indexOf("--source");
const source = sourceIndex >= 0 ? args[sourceIndex + 1] : "nagi";
const sync = args.includes("--sync");
const force = args.includes("--force");

if (!did) {
  console.error(
    "usage: analysis <did> [--source nagi|bluesky] [--sync] [--force]",
  );
  process.exit(1);
}
if (source !== "nagi" && source !== "bluesky") {
  console.error(`unknown source: ${source} (expected 'nagi' or 'bluesky')`);
  process.exit(1);
}

const port = Number(process.env.NAGI_BOT_SERVER_PORT || 3003);
const url = `http://127.0.0.1:${port}/analysis/run`;

const response = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ did, source, sync, force }),
}).catch((error) => {
  console.error(`failed to reach bot server at ${url}:`, error);
  process.exit(1);
});

const body = await response.json().catch(() => undefined);
if (!response.ok) {
  console.error(`${response.status}:`, body ?? (await response.text()));
  process.exit(1);
}

if (!sync) {
  console.log("enqueued. the worker picks it up within ~10s.");
  process.exit(0);
}

if (body?.skipped) {
  console.log(`skipped: ${body.reason}`);
  process.exit(0);
}

const result = body?.result ?? {};
console.log(`updatedAt : ${body?.updatedAt ?? "-"}`);
console.log(`taglineJa : ${result.taglineJa || "(empty)"}`);
console.log(`taglineEn : ${result.taglineEn || "(empty)"}`);
console.log(`tagsJa    : ${(result.tagsJa ?? []).join(" / ") || "(empty)"}`);
console.log(`tagsEn    : ${(result.tagsEn ?? []).join(" / ") || "(empty)"}`);
console.log(`analysisJa: ${result.analysisJa || "(empty)"}`);
process.exit(0);
