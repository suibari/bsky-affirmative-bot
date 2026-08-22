import {
  client,
  disableBotMemoryPronunciation,
  listBotMemoryPronunciations,
  setManualBotMemoryPronunciation,
} from "@bsky-affirmative-bot/database";

function usage(): never {
  console.error(`Usage:
  pnpm tts-pronunciation -- set <surface> <spoken-form> [work|proper_noun]
  pnpm tts-pronunciation -- disable <surface>
  pnpm tts-pronunciation -- list`);
  process.exitCode = 2;
  throw new Error("invalid arguments");
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "set") {
    if (args.length < 2 || args.length > 3) usage();
    const kind = args[2] ?? "proper_noun";
    if (kind !== "work" && kind !== "proper_noun") usage();
    const row = await setManualBotMemoryPronunciation(args[0], args[1], kind);
    console.log(`設定しました: ${row.surface} -> ${row.spoken_form} (${row.kind}, manual)`);
    return;
  }
  if (command === "disable") {
    if (args.length !== 1) usage();
    const row = await disableBotMemoryPronunciation(args[0]);
    if (!row) throw new Error(`登録が見つかりません: ${args[0]}`);
    console.log(`無効化しました: ${row.surface}`);
    return;
  }
  if (command === "list") {
    if (args.length !== 0) usage();
    const rows = await listBotMemoryPronunciations();
    if (rows.length === 0) {
      console.log("登録はありません");
      return;
    }
    console.table(rows.map((row) => ({
      surface: row.surface,
      spokenForm: row.spoken_form ?? "",
      kind: row.kind,
      status: row.status,
      origin: row.origin,
      evidence: row.evidence_count,
      conflicts: row.conflict_count,
    })));
    return;
  }
  usage();
}

main().catch((error) => {
  if (process.exitCode !== 2) console.error(error);
  process.exitCode = process.exitCode || 1;
}).finally(async () => {
  await client.end();
});
