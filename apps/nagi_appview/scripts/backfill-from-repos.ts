import { initializeDatabases } from "@bsky-affirmative-bot/database";
import { BLUEMOJI_ITEM } from "@bsky-affirmative-bot/nagi-lexicon";
import { listReconcileDids } from "../src/ingest/reconcileWorker.js";
import {
  auditBluemojiRepo,
  reconcileRepo,
} from "../src/ingest/reconcileRepo.js";

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
const dryRun = process.argv.includes("--dry-run");

if (all === Boolean(did)) {
  throw new Error("Specify exactly one of --did <did> or --all");
}

await initializeDatabases();
const dids = did ? [did] : await listReconcileDids();

let failed = 0;
const audit = { remote: 0, compliant: 0, invalid: 0, upsert: 0, remove: 0 };
for (const target of dids) {
  try {
    if (dryRun) {
      if (collection !== BLUEMOJI_ITEM)
        throw new Error(`--dry-run requires --collection ${BLUEMOJI_ITEM}`);
      const result = await auditBluemojiRepo(target);
      for (const key of Object.keys(audit) as Array<keyof typeof audit>)
        audit[key] += result[key];
    } else {
      await reconcileRepo(target, collection);
    }
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
  dryRun,
  ...(dryRun ? { audit } : {}),
});
if (failed) process.exitCode = 1;
