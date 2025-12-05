import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { ProfileView, ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { AppBskyFeedDefs, AppBskyEmbedRecord, AppBskyEmbedRecordWithMedia } from "@atproto/api";
import { Record as PostRecord } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { getConcatProfiles } from "./getConcatProfiles";

export type InvolvedUser = {
  profile: ProfileViewDetailed;
  count: number;
};

/**
 * ユーザのフィードから、リプライ、引用、メンションした相手を集計する
 * @param feed FeedViewPost[]
 * @returns InvolvedUser[]
 */
export async function getUserInvolvedUsers(feed: FeedViewPost[]): Promise<InvolvedUser[]> {
  const counts = new Map<string, number>();

  for (const item of feed) {
    // 1. Reply (親ポストの投稿者)
    if (item.reply && AppBskyFeedDefs.isPostView(item.reply.parent)) {
      const did = item.reply.parent.author.did;
      counts.set(did, (counts.get(did) || 0) + 1);
    }

    // 2. Quote (引用先の投稿者)
    const embed = item.post.embed;
    if (AppBskyEmbedRecord.isView(embed)) {
      const record = embed.record;
      if (AppBskyEmbedRecord.isViewRecord(record)) {
        const did = record.author.did;
        counts.set(did, (counts.get(did) || 0) + 1);
      }
    } else if (AppBskyEmbedRecordWithMedia.isView(embed)) {
      const record = embed.record.record;
      if (AppBskyEmbedRecord.isViewRecord(record)) {
        const did = record.author.did;
        counts.set(did, (counts.get(did) || 0) + 1);
      }
    }

    // 3. Mention (メンションされたDID)
    const record = item.post.record as PostRecord;
    if (record?.facets) {
      for (const facet of record.facets) {
        for (const feature of facet.features) {
          if (feature.$type === 'app.bsky.richtext.facet#mention' && (feature as any).did) {
            const did = (feature as any).did as string;
            counts.set(did, (counts.get(did) || 0) + 1);
          }
        }
      }
    }
  }

  // プロフィール情報の取得
  const dids = Array.from(counts.keys());
  let profiles: ProfileViewDetailed[] = [];

  try {
    profiles = await getConcatProfiles({ actors: dids });
  } catch (e) {
    console.warn("[WARN] Failed to fetch profiles:", e);
  }

  const profilesMap = new Map<string, ProfileViewDetailed>();
  for (const p of profiles) {
    profilesMap.set(p.did, p);
  }

  // 結果の構築
  const result: InvolvedUser[] = [];
  for (const did of dids) {
    const profile = profilesMap.get(did);
    if (profile) {
      result.push({
        profile,
        count: counts.get(did)!
      });
    }
  }

  // countの多い順にソート (任意だが便利なので)
  result.sort((a, b) => b.count - a.count);

  return result;
}
