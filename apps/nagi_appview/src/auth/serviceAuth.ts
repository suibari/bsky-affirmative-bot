import { IdResolver } from "@atproto/identity";
import { verifyJwt } from "@atproto/xrpc-server";
import type { RequestHandler } from "express";
import { appviewAudience } from "../config.js";
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
const verify = async (jwt: string, lxm: string) => {
  const payload = await verifyJwt(jwt, appviewAudience, lxm, key);
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
