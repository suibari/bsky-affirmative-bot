import { AtpAgent } from "@atproto/api";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { labelerServiceRecord } from "@bsky-affirmative-bot/shared-configs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function main() {
  const identifier = process.env.LABELER_IDENTIFIER || process.env.BSKY_IDENTIFIER;
  const password = process.env.LABELER_PASSWORD || process.env.BSKY_APP_PASSWORD;

  if (!identifier || !password) {
    console.error(
      "[ERROR] Credentials not found. Please set BSKY_IDENTIFIER and BSKY_APP_PASSWORD (or LABELER_IDENTIFIER and LABELER_PASSWORD) in your .env file."
    );
    process.exit(1);
  }

  console.log(`[INFO] Authenticating as: ${identifier}`);
  const agent = new AtpAgent({ service: "https://bsky.social" });

  try {
    await agent.login({ identifier, password });
    console.log("[INFO] Authentication successful.");
  } catch (err: any) {
    console.error("[ERROR] Login failed:", err.response?.data || err.message || err);
    process.exit(1);
  }

  const labelValues = labelerServiceRecord.policies.labelValues;
  console.log(`[INFO] Registering/Updating ${labelValues.length} labels:`, labelValues);

  const record = {
    $type: "app.bsky.labeler.service",
    ...labelerServiceRecord,
    createdAt: new Date().toISOString(),
  };

  try {
    const res = await agent.api.com.atproto.repo.putRecord({
      repo: agent.session!.did,
      collection: "app.bsky.labeler.service",
      rkey: "self",
      record,
    });
    console.log("[INFO] Successfully updated labeler definitions record.");
    console.log("[INFO] Record URI:", res.data.uri);
  } catch (error: any) {
    console.error(
      "[ERROR] Failed to update labeler definitions:",
      error.response?.data || error.message || error
    );
    process.exit(1);
  }
}

main();
