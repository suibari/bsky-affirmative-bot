import { LabelerServer } from "@skyware/labeler";
import dotenv from "dotenv";
import { AtpAgent } from "@atproto/api";

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

// Initialize AtpAgent for label definition updates
const agent = new AtpAgent({ service: "https://bsky.social" });
let loggedIn = false;

async function getAgent() {
  if (!loggedIn) {
    const identifier = process.env.LABELER_IDENTIFIER || process.env.BSKY_IDENTIFIER;
    const password = process.env.LABELER_PASSWORD || process.env.BSKY_APP_PASSWORD;
    if (!identifier || !password) {
      throw new Error("Missing LABELER_IDENTIFIER or BSKY_IDENTIFIER/PASSWORD in env");
    }
    await agent.login({ identifier, password });
    loggedIn = true;
  }
  return agent;
}

// Queue system (Mutex) for serialized Read-Modify-Write updates
let updateQueue = Promise.resolve();

async function enqueueUpdate<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    updateQueue = updateQueue.then(async () => {
      try {
        const res = await fn();
        resolve(res);
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Create internal Fastify app for private label write operations
const internalApp = fastify();

internalApp.post("/upsert-definition", async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const body = request.body as {
      identifier?: string;
      locales?: Array<{ lang: string; name: string; description: string }>;
    } | null;

    if (!body || !body.identifier || !body.locales) {
      reply.status(400).send({ error: "Missing identifier or locales in request body" });
      return;
    }

    const { identifier, locales } = body;
    console.log(`[INFO][INTERNAL] Upserting label definition: ${identifier}`);

    await enqueueUpdate(async () => {
      const activeAgent = await getAgent();
      const repo = activeAgent.session!.did;

      let retries = 5;
      while (retries > 0) {
        try {
          // 1. Get current record
          let currentRecord: any = {
            $type: "app.bsky.labeler.service",
            policies: {
              labelValues: [],
              labelValueDefinitions: []
            },
            createdAt: new Date().toISOString()
          };
          let cid: string | undefined;

          try {
            const res = await activeAgent.api.com.atproto.repo.getRecord({
              repo,
              collection: "app.bsky.labeler.service",
              rkey: "self"
            });
            currentRecord = res.data.value;
            cid = res.data.cid;
          } catch (e: any) {
            if (e.status !== 404 && !e.message?.includes("Could not locate record")) {
              throw e;
            }
            // 404 (or not found) is okay, we will initialize a new record
          }

          // 2. Modify definitions
          const definitions = currentRecord.policies?.labelValueDefinitions || [];
          const index = definitions.findIndex((d: any) => d.identifier === identifier);

          const fullDef = {
            identifier,
            severity: "inform",
            blurs: "none",
            defaultSetting: "warn",
            locales
          };

          if (index >= 0) {
            definitions[index] = fullDef;
          } else {
            definitions.push(fullDef);
          }

          const labelValues = definitions.map((d: any) => d.identifier);

          const updatedRecord = {
            $type: "app.bsky.labeler.service",
            policies: {
              labelValues,
              labelValueDefinitions: definitions
            },
            createdAt: new Date().toISOString()
          };

          // 3. Put record with optimistic lock (swapRecord)
          const putParams: any = {
            repo,
            collection: "app.bsky.labeler.service",
            rkey: "self",
            record: updatedRecord
          };
          if (cid) {
            putParams.swapRecord = cid;
          }

          await activeAgent.api.com.atproto.repo.putRecord(putParams);
          console.log(`[INFO][INTERNAL] Successfully upserted label definition: ${identifier}`);
          return;
        } catch (err: any) {
          if (err.name === 'InvalidSwap' || err.message?.includes('swap')) {
            console.warn(`[WARN][INTERNAL] OCC conflict while upserting label ${identifier}, retrying...`);
            retries--;
            await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
            continue;
          }
          throw err;
        }
      }
      throw new Error("Failed to upsert label definition due to persistent race conditions.");
    });

    reply.send({ success: true });
  } catch (error: any) {
    console.error("[ERROR][INTERNAL] Failed to upsert label definition:", error);
    reply.status(500).send({ error: error.message || "Internal Server Error" });
  }
});

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
