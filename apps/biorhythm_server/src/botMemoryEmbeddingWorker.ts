import {
  generateEmbeddings,
  getPendingBotMemoryDocuments,
  saveBotMemoryEmbedding,
} from "@bsky-affirmative-bot/database";

const BATCH_SIZE = 16;
const BUSY_INTERVAL_MS = 2_000;
const IDLE_INTERVAL_MS = 30_000;
let running = false;

export async function processBotMemoryEmbeddingBatch(
  deps: {
    fetchPending?: typeof getPendingBotMemoryDocuments;
    embed?: typeof generateEmbeddings;
    save?: typeof saveBotMemoryEmbedding;
  } = {},
): Promise<number> {
  const fetchPending = deps.fetchPending ?? getPendingBotMemoryDocuments;
  const embed = deps.embed ?? generateEmbeddings;
  const save = deps.save ?? saveBotMemoryEmbedding;
  const pending = await fetchPending(BATCH_SIZE);
  if (!pending.length) return 0;
  const embeddings = await embed(pending.map((row) => row.content));
  let updated = 0;
  for (let i = 0; i < pending.length; i++) {
    const embedding = embeddings[i];
    if (!embedding) continue;
    if (await save(
      pending[i].id,
      pending[i].contentHash,
      embedding,
    )) updated++;
  }
  return updated;
}

export function startBotMemoryEmbeddingWorker() {
  if (running) return;
  running = true;
  const loop = async () => {
    let processed = 0;
    try {
      processed = await processBotMemoryEmbeddingBatch();
    } catch (error) {
      console.error("[ERROR][BOT_MEMORY_EMBEDDING]", error);
    }
    const timer = setTimeout(
      () => void loop(),
      processed > 0 ? BUSY_INTERVAL_MS : IDLE_INTERVAL_MS,
    );
    timer.unref?.();
  };
  void loop();
}
