import { LabelerServer } from "@skyware/labeler";
import dotenv from "dotenv";

// Load workspace root .env file
dotenv.config({ path: '../../.env' });

const PORT = Number(process.env.LABELER_SERVER_PORT || 3400);
const DID = process.env.LABELER_DID;
const SIGNING_KEY = process.env.LABELER_SIGNING_KEY;

if (!DID || !SIGNING_KEY) {
  console.error("[CRITICAL] LABELER_DID and LABELER_SIGNING_KEY must be provided in .env.");
  process.exit(1);
}

const labeler = new LabelerServer({
  did: DID,
  signingKey: SIGNING_KEY,
  dbPath: process.env.LABELER_DB_PATH || "./labels.db",
});
import fastify, { type FastifyRequest, type FastifyReply } from "fastify";

// Create internal Fastify app for private label write operations
const internalApp = fastify();

internalApp.post("/label", async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const body = request.body as {
      did?: string;
      val?: string;
      negate?: boolean;
    } | null;

    if (!body || !body.did || !body.val) {
      reply.status(400).send({ error: "Missing did or val in request body" });
      return;
    }

    const { did, val, negate } = body;
    console.log(`[INFO][INTERNAL] Received label request: did=${did}, val=${val}, negate=${!!negate}`);

    // Create the label via @skyware/labeler (negating previous label if negate=true)
    const result = await labeler.createLabel({
      uri: did,
      val: val,
      neg: negate,
    });

    reply.send({ success: true, label: result });
  } catch (error: any) {
    console.error("[ERROR][INTERNAL] Failed to process label request:", error);
    reply.status(500).send({ error: error.message || "Internal Server Error" });
  }
});

// Start the public XRPC server (binds to standard port, e.g. 3400)
labeler.start(PORT, (error: Error | null, address: string) => {
  if (error) {
    console.error("[CRITICAL] Public Labeler Server failed to start:", error);
    process.exit(1);
  }
  console.log(`Public Labeler Server (XRPC) running on address: ${address}`);
});

// Start the internal API server on 127.0.0.1 (localhost) only (binds to port 3401)
const INTERNAL_PORT = Number(process.env.LABELER_INTERNAL_PORT || 3401);
internalApp.listen({ port: INTERNAL_PORT, host: "127.0.0.1" }, (error: Error | null, address: string) => {
  if (error) {
    console.error("[CRITICAL] Internal API Server failed to start:", error);
    process.exit(1);
  }
  console.log(`Internal Write API Server running on address: ${address} (Localhost Only)`);
});
