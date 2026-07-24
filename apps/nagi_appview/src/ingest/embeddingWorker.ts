import { db, generateEmbeddings, nagiPosts } from "@bsky-affirmative-bot/database";
import { and, desc, eq, isNull } from "drizzle-orm";

// 一度に埋め込む件数。Ollama へのバッチ入力サイズ兼 DB 更新単位。
const BATCH_SIZE = 16;
// 未処理が残っていれば速く回し、空振りしたら間隔を空ける（バックフィルと定常の両対応）。
const BUSY_INTERVAL_MS = 2_000;
const IDLE_INTERVAL_MS = 30_000;

let running = false;

/**
 * NL検索(意味検索)用の投稿本文埋め込みを非同期生成するワーカー。
 *
 * ジョブ表は持たず `embedding IS NULL AND deleted_at IS NULL` をスキャンする方式。
 * これで「新規投稿(NULL)」「既存バックフィル(NULL)」「編集で NULL リセットされた行」の
 * すべてが同じ経路で処理される。ingest のトランザクション内では Ollama を呼ばない
 * （ロックを長持ちさせないため）ので、本ワーカーが tx 外で肩代わりする。
 *
 * OLLAMA_BASE_URL 未設定なら generateEmbeddings が null を返すだけなので実質 no-op。
 */
export function startEmbeddingWorker() {
  if (running) return;
  running = true;

  const tick = async (): Promise<number> => {
    const rows = await db
      .select({ uri: nagiPosts.uri, text: nagiPosts.text })
      .from(nagiPosts)
      .where(and(isNull(nagiPosts.embedding), isNull(nagiPosts.deletedAt)))
      // 新しい投稿を優先して埋める（検索需要が高いのは直近）。
      .orderBy(desc(nagiPosts.indexedAt))
      .limit(BATCH_SIZE);

    if (!rows.length) return 0;

    const embeddings = await generateEmbeddings(rows.map((r) => r.text));

    let updated = 0;
    for (let i = 0; i < rows.length; i++) {
      const embedding = embeddings[i];
      if (!embedding) continue; // Ollama 失敗/未設定。次 tick で再挑戦（NULL のまま残す）。
      const written = await db
        .update(nagiPosts)
        .set({ embedding })
        // 埋め込み計算中に本文が編集された場合は書かない（text 一致でガード）。
        // 編集は embedding を NULL に戻すので、この行は次 tick で新しい本文で再処理される。
        .where(and(eq(nagiPosts.uri, rows[i].uri), eq(nagiPosts.text, rows[i].text)))
        .returning({ uri: nagiPosts.uri });
      if (written.length) updated++;
    }
    return updated;
  };

  const loop = async () => {
    let processed = 0;
    try {
      processed = await tick();
    } catch (e) {
      console.error("[ERROR][embeddingWorker]", e);
    }
    setTimeout(() => void loop(), processed > 0 ? BUSY_INTERVAL_MS : IDLE_INTERVAL_MS);
  };

  void loop();
}
