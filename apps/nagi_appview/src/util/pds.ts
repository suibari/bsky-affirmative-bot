import { IdResolver } from "@atproto/identity";
import { ApiError } from "../middleware/errors.js";
import { assertPublicHost, safeUrl } from "./ssrf.js";

const resolver = new IdResolver();
export const DID = /^did:(plc:[a-z2-7]+|web:[a-zA-Z0-9.:%_-]+)$/;

/**
 * DID から PDS のベース URL を解決する。did:web はリゾルバが DID ドキュメント取得のため
 * オーソリティへ fetch するので、その前にプライベート/ループバックを拒否する（SSRF 対策）。
 */
export async function resolvePdsUrl(did: string): Promise<URL> {
  if (!DID.test(did))
    throw new ApiError(400, "invalid_request", "Invalid DID");
  if (did.startsWith("did:web:")) {
    const host = decodeURIComponent(did.slice("did:web:".length)).split(":")[0];
    await assertPublicHost(host);
  }
  const doc = await resolver.did.resolve(did);
  const pds = doc?.service?.find((s: any) => s.id === "#atproto_pds")
    ?.serviceEndpoint;
  if (typeof pds !== "string" || !pds.startsWith("https://"))
    throw new ApiError(404, "not_found", "PDS not found");
  return safeUrl(pds);
}
