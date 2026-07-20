import { db, nagiBotReplyJobs, MemoryService } from "@bsky-affirmative-bot/database";
import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";

/** at://<did>/<nsid>/<rkey> から作者 DID を取り出す。 */
function uriAuthorDid(uri: unknown) {
  if (typeof uri !== "string" || !uri.startsWith("at://")) return undefined;
  const did = uri.slice("at://".length).split("/")[0];
  return did || undefined;
}

/** 本文中に bot への mention facet があるか。 */
export function mentionsBot(record: any, botDid: string) {
  if (!Array.isArray(record?.facets)) return false;
  return record.facets.some((facet: any) =>
    Array.isArray(facet?.features) &&
    facet.features.some(
      (feature: any) =>
        feature?.$type === "app.bsky.richtext.facet#mention" &&
        feature.did === botDid,
    ),
  );
}

/** bot 宛のリプライ（親が bot、または bot をメンション）か。 */
export function isReplyToBot(record: any, botDid: string) {
  if (!record?.reply) return false;
  const parentDid = uriAuthorDid(record.reply.parent?.uri);
  return parentDid === botDid || mentionsBot(record, botDid);
}

/**
 * 第三者のスレッドへの割り込みか。
 * Bluesky の isReplyInThirdPartyThread と同じ意図だが、bot の定期ポストへの返信を
 * 会話に乗せたいので root が bot の場合も許可する。
 */
export function isThirdPartyThread(record: any, authorDid: string, botDid: string) {
  if (!record?.reply) return false;
  // root が欠けた壊れたレコードは parent で代用し、どちらも取れなければ弾く。
  const rootDid =
    uriAuthorDid(record.reply.root?.uri) ?? uriAuthorDid(record.reply.parent?.uri);
  return rootDid !== authorDid && rootDid !== botDid;
}

export async function onNagiPost(evt: any) {
  if (!evt.commit?.record) {
    return;
  }

  const did = evt.did;
  const record = evt.commit.record;
  const botDid = process.env.NAGI_BOT_DID;

  if (!botDid || did === botDid || record.$type !== NAGI.post) {
    return;
  }

  const topLevel = !record.reply;
  const toBot = isReplyToBot(record, botDid);

  if (!topLevel && !toBot) {
    return;
  }

  // 他人のスレッド内で bot に話しかけられても割り込まない。
  if (isThirdPartyThread(record, did, botDid)) {
    console.log(`[INFO][NAGI][${did}] Skipping reply: third-party thread root`);
    return;
  }

  const uri = `at://${did}/${NAGI.post}/${evt.commit.rkey}`;

  if (toBot) {
    // bot 宛リプライは Bluesky 側と同じく Gemini を使う前に記憶・計上しておく。
    await MemoryService.upsertReply(did, {
      reply: record.text,
      uri,
      isRead: 0,
    });
    await MemoryService.logUsage("reply", did);
  }

  await db
    .insert(nagiBotReplyJobs)
    .values({
      sourceUri: uri,
      sourceCid: evt.commit.cid,
      authorDid: did,
      recordJson: record,
    })
    .onConflictDoNothing();
}
