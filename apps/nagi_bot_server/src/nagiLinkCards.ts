import { RichText } from "@atproto/api";
import { getLinkMetadata, getLinkThumbnail } from "@bsky-affirmative-bot/nagi-linkcard";
import { agent } from "./agent.js";

// Nagi の lexicon 上、linkCards は最大 4 件。
const MAX_LINK_CARDS = 4;

type NagiFacet = { index: { byteStart: number; byteEnd: number }; features: unknown[] };
type NagiLinkCardRecord = {
  uri: string;
  title: string;
  description?: string;
  thumb?: unknown;
};

/**
 * 本文からリンク facet を検出する。
 * Bluesky 側 (bsky/post.ts) と同じ RichText の検出結果を使うが、mention/tag facet は落として
 * リンクのみ残す（Nagi では mention の解決経路が異なるため）。
 */
export function buildLinkFacets(text: string): { facets: NagiFacet[]; urls: string[] } {
  const rt = new RichText({ text });
  rt.detectFacetsWithoutResolution();

  const facets: NagiFacet[] = [];
  const urls: string[] = [];
  for (const facet of rt.facets ?? []) {
    const links = facet.features.filter(
      (feature: any) =>
        feature?.$type === "app.bsky.richtext.facet#link" && typeof feature.uri === "string",
    );
    if (!links.length) continue;
    facets.push({ index: facet.index, features: links });
    for (const link of links as Array<{ uri: string }>) {
      if (!urls.includes(link.uri)) urls.push(link.uri);
    }
  }
  return { facets, urls };
}

/**
 * URL ごとに OGP を取得してリンクカードを組み立てる。
 * appview (Nagi クライアントの投稿経路) と同じ getLinkMetadata を使うため、
 * クライアントから投稿したときと同じカードになる。
 */
export async function buildLinkCards(urls: string[]): Promise<NagiLinkCardRecord[]> {
  const cards: NagiLinkCardRecord[] = [];

  for (const url of urls.slice(0, MAX_LINK_CARDS)) {
    try {
      const metadata = await getLinkMetadata(url);
      // 取得に失敗すると { uri, title: hostname } が返る。中身の無いカードは
      // Bluesky 側（OGP が取れなければカードを付けない）に合わせてスキップする。
      const isEmpty =
        !metadata.image && !metadata.description && metadata.title === new URL(url).hostname;
      if (isEmpty) continue;

      let thumb: unknown;
      if (metadata.image) {
        try {
          // サイズ (1MB) と mime 種別の検証は getLinkThumbnail 側で担保されており、
          // Nagi の validateRecord が要求する制約と一致する。
          const { data, contentType } = await getLinkThumbnail(metadata.image);
          const response = await agent.uploadBlob(data, { encoding: contentType });
          thumb = response.data.blob;
        } catch (error) {
          console.warn(`[WARN][NAGI] Failed to upload link thumbnail for ${url}:`, error);
        }
      }

      cards.push({
        uri: metadata.uri,
        title: metadata.title,
        ...(metadata.description ? { description: metadata.description } : {}),
        ...(thumb ? { thumb } : {}),
      });
    } catch (error) {
      // 1 件の失敗で投稿全体を落とさない。
      console.warn(`[WARN][NAGI] Failed to build link card for ${url}:`, error);
    }
  }

  return cards;
}

/**
 * 本文に対応する facets / linkCards を返す。リンクカード生成が失敗しても
 * 投稿自体は成功させたいので、例外は握りつぶして空の結果を返す。
 */
export async function buildLinkAttachments(
  text: string,
): Promise<{ facets?: NagiFacet[]; linkCards?: NagiLinkCardRecord[] }> {
  try {
    const { facets, urls } = buildLinkFacets(text);
    if (!facets.length) return {};
    const linkCards = await buildLinkCards(urls);
    return {
      facets,
      ...(linkCards.length ? { linkCards } : {}),
    };
  } catch (error) {
    console.warn("[WARN][NAGI] Failed to build link attachments:", error);
    return {};
  }
}
