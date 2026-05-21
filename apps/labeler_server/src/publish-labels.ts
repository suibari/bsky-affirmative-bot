import { AtpAgent } from "@atproto/api";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Resolve paths for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load workspace root .env file relative to this script
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function main() {
  const jsonPath = path.resolve(__dirname, "../../../labeler/labels.json");
  console.log(`[INFO] Reading label definitions from: ${jsonPath}`);
  
  if (!fs.existsSync(jsonPath)) {
    console.error(`[ERROR] Label definitions file not found at: ${jsonPath}`);
    process.exit(1);
  }

  let data;
  try {
    const rawData = fs.readFileSync(jsonPath, "utf-8");
    data = JSON.parse(rawData);
  } catch (err: any) {
    console.error(`[ERROR] Failed to read or parse labels.json: ${err.message}`);
    process.exit(1);
  }

  if (!data.labelValueDefinitions || !Array.isArray(data.labelValueDefinitions)) {
    console.error("[ERROR] Invalid JSON structure. Missing 'labelValueDefinitions' array.");
    process.exit(1);
  }

  // Get credentials
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

  const labelValues = data.labelValueDefinitions.map((def: any) => def.identifier);

  const record = {
    $type: "app.bsky.labeler.service",
    policies: {
      labelValues,
      labelValueDefinitions: data.labelValueDefinitions,
    },
    createdAt: new Date().toISOString(),
  };

  console.log(`[INFO] Registering/Updating ${labelValues.length} labels:`, labelValues);

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
