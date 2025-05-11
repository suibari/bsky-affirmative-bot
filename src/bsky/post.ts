import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { agent } from './agent.js';
import { BlobRef, RichText } from "@atproto/api";
import ogs from 'open-graph-scraper'; // ← これを使ってOGP取得

/**
 * postのオーバーライド
 * 開発環境ではなにもしない
 * @param {*} record 
 */
export async function post(record: Record): Promise<{
  uri: string,
  cid: string,
}> {
  if (process.env.NODE_ENV === "production") {
    // リッチテキスト解釈
    const rt = new RichText({text: record.text});
    await rt.detectFacets(agent);
    record.text = rt.text;
    record.facets = rt.facets;
    
    // リンクカード自動付与
    const urlMatch = record.text.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      const url = urlMatch[0];

      const { result } = await ogs({ url });
      if (result.success) {
        let thumbBlob: BlobRef | undefined = undefined;
        const imageUrl = result.ogImage?.[0]?.url;

        if (imageUrl) {
          try {
            const imageRes = await fetch(imageUrl);
            const arrayBuffer = await imageRes.arrayBuffer();
            const imageBuffer = Buffer.from(arrayBuffer);
            const contentType = imageRes.headers.get("content-type") || "image/jpeg";

            const response = await agent.uploadBlob(imageBuffer, {
              encoding: contentType,
            });
            thumbBlob = response.data.blob;
          } catch (err) {
            console.warn(`[WARN] Failed to upload image: ${imageUrl}`, err);
          }
        }

        record.embed = {
          $type: 'app.bsky.embed.external',
          external: {
            uri: url,
            title: result.ogTitle || url,
            description: result.ogDescription || '',
            thumb: thumbBlob, // undefinedでもOK（画像なし）
          }
        };
      }
    }

    // 投稿
    const response = await agent.post(record);
    return {
      uri: response.uri,
      cid: response.cid,
    };
  }

  console.log(`[DEBUG] bot>>> ${record.text}`);
  return {
    uri: "dev-stub-uri",
    cid: "dev-stub-cid",
  };
}
