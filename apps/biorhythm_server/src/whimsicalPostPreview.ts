import {
  getPositiveNewsCandidates,
  WhimsicalPostGenerator,
} from "@bsky-affirmative-bot/bot-brain";
import { getRecentNewsArticleIds } from "./whimsicalPostNewsHistory.js";

function oneLine(value: string | undefined) {
  return (value ?? "").replace(/[\r\n\t]+/g, " ").trim();
}

async function main() {
  const excludedNewsArticleIds = await getRecentNewsArticleIds();
  const news = await getPositiveNewsCandidates({
    excludeArticleIds: excludedNewsArticleIds,
    forceRefresh: true,
  });
  const { diagnostics } = news;

  console.log("\n=== NewsData / Gemma screening ===");
  console.log(`totalResults: ${diagnostics.totalResults}`);
  console.log(`pagesFetched: ${diagnostics.pagesFetched}`);
  console.log(`articlesFetched: ${diagnostics.articlesFetched}`);
  console.log(`recentlyExcluded: ${excludedNewsArticleIds.length}`);
  console.log(`gemmaAccepted: ${diagnostics.decisions.filter((item) => item.decision === "accept" && !item.promotional).length}`);
  console.log(`finalCandidates: ${news.candidates.length}`);
  if (diagnostics.errors.length) {
    console.log(`errors: ${diagnostics.errors.join(" / ")}`);
  }

  for (const item of diagnostics.decisions) {
    const status = item.decision === "accept" && !item.promotional ? "ACCEPT" : "REJECT";
    console.log(
      `[${status}] id=${item.article.articleId} source=${oneLine(item.article.sourceName) || "unknown"} reason=${item.reasonCode} promotional=${item.promotional}`,
    );
    console.log(`  ${oneLine(item.article.title)}`);
  }

  console.log("\n=== Candidates passed to Gemini ===");
  for (const candidate of news.candidates) {
    console.log(`- id=${candidate.articleId} source=${oneLine(candidate.sourceName) || "unknown"}`);
    console.log(`  ${oneLine(candidate.title)}`);
  }
  if (!news.candidates.length) console.log("(none)");

  const generator = new WhimsicalPostGenerator();
  const generated = await generator.generate({
    langStr: "日本語",
    currentMood: "ニュースを眺めながら、のんびり過ごしているよ",
    newsCandidates: news.candidates,
  });

  console.log("\n=== Gemini final selection ===");
  console.log(`selectedNewsArticleId: ${generated.selectedNewsArticleId ?? "none"}`);
  console.log("\n=== Generated Japanese post body ===");
  console.log(generated.textJa);
  console.log("\nNOTE: 通常の定期投稿では、この本文の後ろにMyMoodSongが追加されます。投稿・利用履歴更新は行っていません。");
}

main().catch((error) => {
  console.error("[ERROR][NEWS_PREVIEW]", error);
  process.exitCode = 1;
});
