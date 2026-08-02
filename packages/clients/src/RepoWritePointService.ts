import type { AtpAgent } from "@atproto/api";
import {
  MemoryService,
  type RepoWriteAction,
} from "@bsky-affirmative-bot/database";

type RepoWriteParams = {
  repo: string;
  collection: string;
  rkey?: string;
  [key: string]: unknown;
};

function isRecordNotFound(error: any): boolean {
  return (
    error?.status === 404 ||
    error?.response?.status === 404 ||
    error?.error === "RecordNotFound" ||
    error?.response?.data?.error === "RecordNotFound"
  );
}

/** PDS書き込み自体は成功済みなので、計測DB障害を呼び出し元の再試行へ波及させない。 */
export async function recordRepoWritePoint(
  did: string | undefined,
  action: RepoWriteAction,
  source: string,
): Promise<void> {
  if (!did) {
    console.warn(`[WARN][RATE_LIMIT] Cannot record ${source}: bot DID is missing.`);
    return;
  }
  try {
    await MemoryService.recordRepoWrite(did, action, source);
  } catch (error) {
    console.error(`[ERROR][RATE_LIMIT] Failed to record ${source}:`, error);
  }
}

export async function trackedCreateRecord(
  agent: AtpAgent,
  params: RepoWriteParams,
  source: string,
) {
  const response = await agent.api.com.atproto.repo.createRecord(params as any);
  if (agent.session?.did === params.repo) {
    await recordRepoWritePoint(params.repo, "create", source);
  }
  return response;
}

/** putRecordはupsertなので、書き込み前の存在確認でCREATE/UPDATEを区別する。 */
export async function trackedPutRecord(
  agent: AtpAgent,
  params: RepoWriteParams & { rkey: string },
  source: string,
) {
  let action: RepoWriteAction = "create";
  const shouldTrack = agent.session?.did === params.repo;
  if (shouldTrack) {
    try {
      await agent.api.com.atproto.repo.getRecord({
        repo: params.repo,
        collection: params.collection,
        rkey: params.rkey,
      });
      action = "update";
    } catch (error) {
      if (!isRecordNotFound(error)) {
        // 判定不能時は上限監視を過小評価しないようCREATEとして扱う。
        console.warn(
          `[WARN][RATE_LIMIT] Could not classify ${source}; counting as CREATE.`,
          error,
        );
      }
    }
  }

  const response = await agent.api.com.atproto.repo.putRecord(params as any);
  if (shouldTrack) {
    await recordRepoWritePoint(params.repo, action, source);
  }
  return response;
}

export async function trackedDeleteRecord(
  agent: AtpAgent,
  params: RepoWriteParams & { rkey: string },
  source: string,
) {
  const response = await agent.api.com.atproto.repo.deleteRecord(params as any);
  if (agent.session?.did === params.repo) {
    await recordRepoWritePoint(params.repo, "delete", source);
  }
  return response;
}
