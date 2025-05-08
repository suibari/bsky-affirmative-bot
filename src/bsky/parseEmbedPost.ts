import { AppBskyEmbedExternal, AppBskyEmbedImages, AppBskyEmbedRecord, BlobRef } from "@atproto/api";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { agent } from "./agent.js"

/**
 * 引用ポストの解析
 * @param record 
 * @returns 
 */
export async function parseEmbedPost(record: Record) {
  const embed = record.embed as AppBskyEmbedRecord.Main | AppBskyEmbedExternal.Main;

  let text_embed: string | null = null;
  let uri_embed: string | null = null;
  let image_embed: string | null = null;

  if (embed.$type === 'app.bsky.embed.record') {
    const did_embed = embed.record.uri.split('/')[2];
    const nsid_embed = embed.record.uri.split('/')[3];
    const rkey_embed = embed.record.uri.split('/')[4];
    const response =  await agent.com.atproto.repo.getRecord({
      repo: did_embed,
      collection: nsid_embed,
      rkey: rkey_embed
    });
    
    // embed text
    const value_embed = response.data.value as Record;
    text_embed = value_embed.text ?? "";

    // embed image
    let image_embed_blob: BlobRef | undefined;
    if (
      value_embed.embed &&
      (value_embed.embed as AppBskyEmbedImages.Main).images &&
      Array.isArray((value_embed.embed as AppBskyEmbedImages.Main).images)
    ) {
      image_embed_blob = (value_embed.embed as AppBskyEmbedImages.Main).images[0]?.image;
    }
    image_embed = image_embed_blob ? `https://cdn.bsky.app/img/feed_fullsize/plain/${did_embed}/${image_embed_blob.ref}` : null;
  } else if (embed.$type === 'app.bsky.embed.external') {
    uri_embed = embed.external.uri;
  }

  return {text_embed, uri_embed, image_embed};
}
