import { resolveLexicon as resolveLexiconFromNetwork } from "@atproto/lexicon-resolver";
import { ApiError } from "../middleware/errors.js";

export type ResolveLexiconResult = {
  resolved: boolean;
  nsid: string;
  /** 解決できた場合の Lexicon ドキュメント（com.atproto.lexicon.schema の value 相当）。 */
  schema?: unknown;
};

// NSID の緩い形式チェック（詳細な検証は resolver 側に任せる）。
const NSID = /^[a-zA-Z]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

// DNS 解決を伴い遅い／レート制限があるため、結果を軽くキャッシュする。
// 解決成功は長め、未解決（negative）は短めの TTL。emoji.ts の negativeCache と同方針。
const POSITIVE_TTL_MS = 60 * 60_000;
const NEGATIVE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; result: ResolveLexiconResult }>();

export async function resolveLexicon(nsid: string): Promise<ResolveLexiconResult> {
  if (!nsid || !NSID.test(nsid) || nsid.length > 317)
    throw new ApiError(400, "invalid_request", "Invalid NSID");

  const cached = cache.get(nsid);
  if (cached) {
    const ttl = cached.result.resolved ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
    if (Date.now() - cached.at < ttl) return cached.result;
  }

  let result: ResolveLexiconResult;
  try {
    const resolution = await resolveLexiconFromNetwork(nsid);
    result = { resolved: true, nsid, schema: resolution.lexicon };
  } catch {
    // publish されていない／DNS 未設定／到達不能などは「未解決」として空で返す。
    // クライアントはサンプル値ベースのフィールド選択にフォールバックする。
    result = { resolved: false, nsid };
  }
  cache.set(nsid, { at: Date.now(), result });
  return result;
}
