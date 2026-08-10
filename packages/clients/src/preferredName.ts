import { MemoryService } from "@bsky-affirmative-bot/database";
import type { UserInfoGemini } from "@bsky-affirmative-bot/shared-configs";

/** 設定名の取得口。全機能はMemoryServiceを直接呼ばず、ここへ集約する。 */
export async function loadPreferredName(
  did: string,
  load: (did: string) => Promise<string | null> = (targetDid) =>
    MemoryService.getPreferredName(targetDid),
): Promise<string | null> {
  return load(did);
}

/**
 * DBに保存された「呼んでほしい名前」をUserInfoGeminiへ注入する。
 *
 * 呼称を使う機能は、入力構築時にこの関数を通し、プロンプト側では
 * addressName() / NAME_RULES_JA・ENを使う。今回は日記だけから利用する。
 * DB障害や未設定時はpreferredName=nullとなり、従来のdisplayNameへ安全に戻る。
 */
export async function withPreferredName<T extends UserInfoGemini>(
  userinfo: T,
  load: (did: string) => Promise<string | null> = loadPreferredName,
): Promise<T & Pick<UserInfoGemini, "preferredName">> {
  if (userinfo.preferredName?.trim()) {
    return { ...userinfo, preferredName: userinfo.preferredName };
  }
  const preferredName = await load(userinfo.follower.did);
  return { ...userinfo, preferredName };
}
