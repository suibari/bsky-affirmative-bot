import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import { agent } from "./agent.js";

function getLoggedInBotDid() {
  const loggedInDid = agent.session?.did;
  const configuredDid = process.env.NAGI_BOT_DID;

  if (!loggedInDid) {
    throw new Error("Bot must be logged in before syncing its Nagi profile");
  }

  if (!configuredDid || !/^did:(plc|web):/.test(configuredDid)) {
    throw new Error("NAGI_BOT_DID must be an AT Protocol DID");
  }

  if (configuredDid !== loggedInDid) {
    throw new Error("NAGI_BOT_DID does not match the logged-in Bot account");
  }

  return loggedInDid;
}

export function assertNagiBotIdentity() {
  getLoggedInBotDid();
}

export async function syncNagiBotProfile() {
  const botDid = getLoggedInBotDid();
  const profileView = await agent.api.app.bsky.actor.getProfile({ actor: botDid });

  let bskyProfileRecord: any = {};
  try {
    const response = await agent.api.com.atproto.repo.getRecord({
      repo: botDid,
      collection: "app.bsky.actor.profile",
      rkey: "self",
    });
    bskyProfileRecord = response.data.value;
  } catch (error) {
    console.warn(
      "[WARN][NAGI] Could not read the Bluesky profile record; syncing without its avatar blob.",
      error,
    );
  }

  const record = {
    $type: NAGI.profile,
    displayName:
      bskyProfileRecord.displayName ??
      profileView.data.displayName ??
      profileView.data.handle,
    description: bskyProfileRecord.description ?? profileView.data.description,
    avatar: bskyProfileRecord.avatar,
    createdAt: new Date().toISOString(),
  };

  await agent.api.com.atproto.repo.putRecord({
    repo: botDid,
    collection: NAGI.profile,
    rkey: "self",
    validate: false,
    record,
  } as any);

  console.log("[INFO][NAGI] Synced Bot Bluesky profile to nagi.profile/self.");
}
