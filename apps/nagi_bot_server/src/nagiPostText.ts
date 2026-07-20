const MAX_GRAPHEMES = 3000;
const MAX_BYTES = 30000;

/**
 * Nagi のポスト本文をレキシコンの上限（3000書記素 / 30000バイト）に収める。
 * 超過したレコードは appview の validateRecord に弾かれてインデックスされないため、
 * 投稿前に必ず通す。
 */
export function clipNagiPostText(text: string, label = "NAGI") {
  const segments = [
    ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
  ];
  if (
    segments.length <= MAX_GRAPHEMES &&
    Buffer.byteLength(text, "utf8") <= MAX_BYTES
  ) {
    return text;
  }

  let clipped = "";
  for (const { segment } of segments.slice(0, MAX_GRAPHEMES)) {
    if (Buffer.byteLength(clipped + segment, "utf8") > MAX_BYTES) break;
    clipped += segment;
  }
  console.warn(`[WARN][${label}] Nagi text was clipped (${segments.length} graphemes).`);
  return clipped;
}
