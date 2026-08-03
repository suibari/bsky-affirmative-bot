// 姉妹アプリ（botたんのお部屋など）へ「サインイン済みのまま」移動するための
// 短命チケットを発行する。
//
// チケットが運ぶのは「この利用者は指定の DID である」という主張だけで、
// アクセストークンも権限も含まない。認可の実体は既存の service auth
// （requiredServiceAuth が検証した viewerDid）なので、新しい認証経路は増えない。

import { createIssuer, type Issuer } from "@suibari/nagi-passport/issuer";
import { config } from "../config.js";

let issuer: Issuer | undefined;

/** 発行が有効か。無効なら呼び出し側は 501 を返してクライアントをフォールバックさせる。 */
export const ssoTicketEnabled = (): boolean => Boolean(config.passport);

function getIssuer(): Issuer {
  if (!config.passport) {
    throw new Error("SSO ticket issuing is not configured");
  }
  if (!issuer) {
    issuer = createIssuer({
      issuer: config.passport.issuer,
      privateJwk: config.passport.privateJwk,
      audiences: config.passport.audiences,
      ttlSeconds: config.passport.ttlSeconds,
    });
  }
  return issuer;
}

export async function createSsoTicket(
  viewerDid: string,
  audience: string,
): Promise<{ ticket: string; expiresIn: number }> {
  return getIssuer().createTicket({ did: viewerDid, audience });
}

/** 遷移先が許可リストに載っているか。ルート側で 400 と 501 を切り分けるために使う。 */
export function isAllowedAudience(audience: string): boolean {
  return Boolean(config.passport?.audiences.includes(audience));
}

/**
 * 検証側に配る公開鍵。秘密指数 d を落とした JWK だけを返す。
 * 鍵ローテーション時は PASSPORT_PRIVATE_JWK を差し替えるだけでよいよう、
 * 公開鍵は秘密鍵から導出する（2箇所に書かない）。
 */
export function passportPublicJwks(): { keys: Record<string, unknown>[] } {
  if (!config.passport) return { keys: [] };
  const { kty, crv, x, y, kid } = config.passport.privateJwk as Record<string, unknown>;
  return { keys: [{ kty, crv, x, y, kid, alg: "ES256", use: "sig" }] };
}
