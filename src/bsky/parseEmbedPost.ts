import { AppBskyEmbedExternal, AppBskyEmbedImages,AppBskyEmbedRecord, AppBskyEmbedRecordWithMedia, BlobRef } from "@atproto/api";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { agent } from "./agent.js"
import { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs.js";
import { getImageUrl, splitUri } from "./util.js";
import { Embed, ImageRef } from "../types.js";

/**
 * 引用ポストの解析
 * @param record 
 * @returns 
 */
export async function parseEmbedPost(record: Record): Promise<Embed | undefined> {
  const embed = record.embed;

  if (embed && (AppBskyEmbedRecord.isMain(embed) || AppBskyEmbedRecordWithMedia.isMain(embed))) {
    let uri: string | undefined;
    if (AppBskyEmbedRecord.isMain(embed)) {
      uri = (embed as AppBskyEmbedRecord.Main).record.uri;
    } else if (AppBskyEmbedRecordWithMedia.isMain(embed)) {
      uri = (embed as AppBskyEmbedRecordWithMedia.Main).record.record.uri;
    } else {
      uri = undefined;
    }

    if (!uri) return undefined;
    const {did, nsid, rkey} = splitUri(uri)

    try {
      const response =  await agent.com.atproto.repo.getRecord({
        repo: did,
        collection: nsid,
        rkey: rkey,
      });
      
      // embed user
      const response_prof = await agent.app.bsky.actor.getProfile({actor: did});
      const profile_embed = response_prof.data; 

      // embed text
      const value_embed = response.data.value as Record;
      const text_embed = value_embed.text ?? "";
  
      // embed image
      const image_embed = getImageUrl(did, embed)

      return {profile_embed, text_embed, image_embed};
    } catch (error) {
      console.warn(`Could not fetch embed record: ${embed.record}`);
      console.warn(error);
    }
  } else if (AppBskyEmbedExternal.isMain(embed)) {
    const uri_embed = embed.external.uri;

    return {uri_embed};
  }

  return undefined;
}
