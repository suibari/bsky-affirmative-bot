import { initializeDatabases } from "@bsky-affirmative-bot/clients";
import { db, nagiNews, nagiNewsApprovals } from "@bsky-affirmative-bot/database";
import { getPositiveNewsCandidates, judgePositiveNewsBatch } from "@bsky-affirmative-bot/bot-brain";
import { desc, eq } from "drizzle-orm";

await initializeDatabases();
const command = process.argv[2];
if (command === "preview") {
  const result = await getPositiveNewsCandidates({ forceRefresh: true });
  const decisions = await judgePositiveNewsBatch(result.candidates);
  console.log(JSON.stringify({ candidates: result.candidates, decisions, diagnostics: result.diagnostics }, null, 2));
} else if (command === "list") {
  const rows = await db.select({ news: nagiNews, approval: nagiNewsApprovals }).from(nagiNews).leftJoin(nagiNewsApprovals, eq(nagiNewsApprovals.newsUri, nagiNews.uri)).orderBy(desc(nagiNews.indexedAt)).limit(100);
  console.log(JSON.stringify(rows, null, 2));
} else if (command === "hide") {
  const uri = process.argv[3];
  if (!uri) throw new Error("Usage: pnpm news:feed:hide -- <at-uri>");
  const changed = await db.update(nagiNewsApprovals).set({ status: "hidden", hiddenAt: new Date() }).where(eq(nagiNewsApprovals.newsUri, uri)).returning({ uri: nagiNewsApprovals.newsUri });
  console.log(JSON.stringify({ hidden: changed.length }));
} else throw new Error("command must be preview, list or hide");
