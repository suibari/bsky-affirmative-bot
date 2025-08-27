import { gemini } from ".";
import cosineSimilarity from "compute-cosine-similarity";
import { MODEL_GEMINI_EMBEDDING } from "../config";

const THRD_COSINE_SIMILARITY = 0.85;

/**
 * エンベディングとコサイン類似計算し、しきい値以上の類似性をもつtargetTextsを返す
 * @param srcText 元テキスト
 * @param targetTexts 比較対象テキスト群
 * @returns 類似性がしきい値以上のテキスト配列
 */
export async function embeddingTexts(srcText: string, targetTexts: string[]) {
  const response = await gemini.models.embedContent({
    model: MODEL_GEMINI_EMBEDDING,
    contents: [srcText, ...targetTexts],
    config: {
      taskType: "SEMANTIC_SIMILARITY",
    }
  })

  const rawEmbeddings = response.embeddings?.map(e => e.values);
  const validEmbeddings = rawEmbeddings?.filter(embedding => Array.isArray(embedding)) as number[][];

  if (validEmbeddings) {
    const srcEmbedding = validEmbeddings[0];
    const similarTexts: string[] = [];
    for (let i = 1; i < validEmbeddings.length; i++) {
      const targetEmbedding = validEmbeddings[i];
      const similarity = cosineSimilarity(srcEmbedding, targetEmbedding);
      if (similarity && similarity >= THRD_COSINE_SIMILARITY) {
        similarTexts.push(targetTexts[i - 1]); // targetTextsのインデックスは1つずれる
        console.log(`[INFO][CosineSimilarity] Found similar texts, src: ${srcText}, ${targetTexts[i-1]}`);
      }
    }
    return similarTexts;
  } else {
    console.warn("[WARN] Could not compute embeddings or embeddings are incomplete. Skipping similarity calculation.");
    return [];
  }
}
