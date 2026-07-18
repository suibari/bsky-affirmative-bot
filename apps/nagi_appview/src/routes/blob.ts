import type { RequestHandler } from "express";
import { IdResolver } from "@atproto/identity";
import { ApiError } from "../middleware/errors.js";
const resolver = new IdResolver();
const DID = /^did:(plc:[a-z2-7]+|web:[a-zA-Z0-9.:%_-]+)$/;
const CID = /^[a-zA-Z0-9]+$/;
export const getBlob: RequestHandler = async (req, res, next) => {
  try {
    const { did, cid } = req.params;
    if (!DID.test(did) || !CID.test(cid))
      throw new ApiError(400, "invalid_request", "Invalid DID or CID");
    const doc = await resolver.did.resolve(did);
    const pds = doc?.service?.find((s: any) => s.id === "#atproto_pds")?.serviceEndpoint;
    if (typeof pds !== "string" || !pds.startsWith("https://"))
      throw new ApiError(404, "not_found", "PDS not found");
    const url = new URL("/xrpc/com.atproto.sync.getBlob", pds);
    url.searchParams.set("did", did);
    url.searchParams.set("cid", cid);
    const upstream = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!upstream.ok || !upstream.body)
      throw new ApiError(
        upstream.status === 404 ? 404 : 502,
        "upstream_unavailable",
        "Blob unavailable",
      );
    const type = upstream.headers.get("content-type") ?? "";
    if (!type.startsWith("image/"))
      throw new ApiError(415, "invalid_request", "Unsupported blob type");
    res.set({
      "Content-Type": type,
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    upstream.body
      .pipeTo(
        new WritableStream({
          write(chunk) {
            res.write(Buffer.from(chunk));
          },
          close() {
            res.end();
          },
          abort() {
            res.end();
          },
        }),
      )
      .catch(next);
  } catch (e) {
    next(e);
  }
};
