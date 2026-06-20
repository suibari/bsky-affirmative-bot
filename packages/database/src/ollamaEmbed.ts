export async function generateEmbedding(text: string): Promise<number[] | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  const model   = process.env.OLLAMA_EMBED_MODEL ?? "snowflake-arctic-embed2";
  if (!baseUrl) return null;

  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json() as any;
    const embedding: number[] = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== 1024) {
      throw new Error(`Unexpected embedding shape: length=${embedding?.length}`);
    }
    return embedding;
  } catch (e) {
    console.error("[ERROR][ollamaEmbed]", e);
    return null;
  }
}

export async function generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  const model   = process.env.OLLAMA_EMBED_MODEL ?? "snowflake-arctic-embed2";
  if (!baseUrl || texts.length === 0) return texts.map(() => null);

  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json() as any;
    return (data?.data as any[]).map((item: any) =>
      Array.isArray(item?.embedding) ? item.embedding as number[] : null
    );
  } catch (e) {
    console.error("[ERROR][generateEmbeddings]", e);
    return texts.map(() => null);
  }
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function filterRelatedHistory(
  queryText: string,
  candidates: string[],
  topN: number = 10
): Promise<string[]> {
  if (candidates.length === 0) return [];
  if (candidates.length <= topN) return candidates;

  const embeddings = await generateEmbeddings([queryText, ...candidates]);
  const queryEmb = embeddings[0];

  if (!queryEmb) {
    console.warn("[WARN][filterRelatedHistory] embedding failed, falling back to head slice");
    return candidates.slice(0, topN);
  }

  const ranked = candidates
    .map((text, i) => ({ text, sim: embeddings[i + 1] ? cosineSim(queryEmb, embeddings[i + 1]!) : 0 }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topN);

  console.log(`[DEBUG][filterRelatedHistory] ${candidates.length}件から上位${topN}件を選択`);
  ranked.forEach((r, i) => console.log(`  [${i}] sim=${r.sim.toFixed(3)} "${r.text.slice(0, 40)}..."`));

  return ranked.map(x => x.text);
}
