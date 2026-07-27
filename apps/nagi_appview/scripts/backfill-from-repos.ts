import { initializeDatabases } from "@bsky-affirmative-bot/database";
import { listReconcileDids } from "../src/ingest/reconcileWorker.js";
import { reconcileRepo } from "../src/ingest/reconcileRepo.js";

const valueAfter = (name: string): string | undefined => {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1];
  return process.argv
    .find((arg) => arg.startsWith(`${name}=`))
    ?.slice(name.length + 1);
};

const all = process.argv.includes("--all");
const did = valueAfter("--did");
const collection = valueAfter("--collection");

if (all === Boolean(did)) {
  throw new Error("Specify exactly one of --did <did> or --all");
}

await initializeDatabases();
const dids = did ? [did] : await listReconcileDids();

let failed = 0;
for (const target of dids) {
  try {
    await reconcileRepo(target, collection);
  } catch (error) {
    failed++;
    console.error("[ERROR][backfill] Failed", {
      did: target,
      collection,
      error,
    });
  }
}

console.log("[INFO][backfill] Complete", {
  repositories: dids.length,
  failed,
});
if (failed) process.exitCode = 1;
