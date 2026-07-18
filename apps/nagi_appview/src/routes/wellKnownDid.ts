import type { RequestHandler } from "express";
import { config } from "../config.js";
export const wellKnownDid: RequestHandler = (_req, res) =>
  res.json({
    "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/multikey/v1"],
    id: config.appviewDid,
    service: [
      {
      id: `#${config.appviewServiceId}`,
        type: "AtprotoPersonalDataServer",
        serviceEndpoint: `https://${config.appviewDid.slice(8)}`,
      },
    ],
  });
