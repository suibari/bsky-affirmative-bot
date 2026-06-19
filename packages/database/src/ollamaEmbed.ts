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
