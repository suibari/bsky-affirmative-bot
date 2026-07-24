import { NAGI, type NagiPost } from "@bsky-affirmative-bot/nagi-lexicon";
import { agent } from "./agent.js";
import { buildNagiPostAttachments } from "./nagiLinkCards.js";
import { clipNagiPostText } from "./nagiPostText.js";

type NagiPostFields = Omit<
  NagiPost,
  "$type" | "text" | "facets" | "linkCards" | "createdAt"
>;

export type PublishNagiPostRequest = NagiPostFields & {
  text: string;
  /** ログ上で本文切り詰めの発生元を識別するラベル。 */
  label?: string;
  /** 指定時は同じ rkey へ putRecord、未指定時は createRecord する。 */
  rkey?: string;
};

/**
 * botたんが作る Nagi 投稿の共通レコード生成経路。
 * facet のバイト位置を本文と一致させるため、切り詰め後に必ず自動検出する。
 */
export async function buildNagiPostRecord({
  text: sourceText,
  label = "NAGI_POST",
  rkey: _rkey,
  ...fields
}: PublishNagiPostRequest): Promise<NagiPost> {
  const text = clipNagiPostText(sourceText, label);
  return {
    $type: NAGI.post,
    text,
    createdAt: new Date().toISOString(),
    ...fields,
    ...(await buildNagiPostAttachments(text)),
  };
}

/**
 * botたんの com.suibari.nagi.post は、投稿種別にかかわらずすべてここを通す。
 */
export async function publishNagiPost(request: PublishNagiPostRequest) {
  const record = await buildNagiPostRecord(request);
  const common = {
    repo: process.env.NAGI_BOT_DID!,
    collection: NAGI.post,
    validate: false,
    record,
  };
  const response = request.rkey
    ? await agent.api.com.atproto.repo.putRecord({
        ...common,
        rkey: request.rkey,
      } as any)
    : await agent.api.com.atproto.repo.createRecord(common as any);

  return { uri: response.data.uri, cid: response.data.cid };
}
