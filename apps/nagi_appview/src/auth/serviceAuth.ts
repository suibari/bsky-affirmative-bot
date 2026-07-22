import { IdResolver } from "@atproto/identity";
import { verifyJwt } from "@atproto/xrpc-server";
import type { RequestHandler } from "express";
import { appviewAudience, config } from "../config.js";
import { ApiError } from "../middleware/errors.js";

declare global {
  namespace Express {
    interface Request {
      viewerDid?: string;
    }
  }
}
const resolver = new IdResolver();
const key = (did: string, forceRefresh: boolean) =>
  resolver.did.resolveAtprotoKey(did, forceRefresh);
const bearer = (header?: string) => header?.match(/^Bearer (.+)$/i)?.[1];
// atproto-proxy 経由（PDS がトークンを発行）と自前 getServiceAuth 経由の双方を受け付ける。
// Spring 2026 以降の PDS は full service reference (`did#service`) を aud に載せるが、
// 未更新の PDS は fragment を落として bare DID を載せるため、移行期は両方を許容する。
const acceptedAudiences = new Set([appviewAudience, config.appviewDid]);
const verify = async (jwt: string, lxm: string) => {
  // audience チェックは verifyJwt(ownDid=null) でスキップし、full/bare 両対応で自前検証する。
  const payload = await verifyJwt(jwt, null, lxm, key);
  if (!acceptedAudiences.has(payload.aud)) {
    throw new Error("jwt audience does not match service did");
  }
  return payload.iss;
};
export const optionalServiceAuth =
  (lxm: string): RequestHandler =>
  async (req, _res, next) => {
    const token = bearer(req.header("authorization"));
    if (!token) return next();
    try {
      req.viewerDid = await verify(token, lxm);
      next();
    } catch {
      next(new ApiError(401, "auth_required", "Invalid service authentication"));
    }
  };
export const requiredServiceAuth =
  (lxm: string): RequestHandler =>
  async (req, _res, next) => {
    const token = bearer(req.header("authorization"));
    if (!token) return next(new ApiError(401, "auth_required", "Authentication required"));
    try {
      req.viewerDid = await verify(token, lxm);
      next();
    } catch {
      next(new ApiError(401, "auth_required", "Invalid service authentication"));
    }
  };
