import { getConcatFollowers } from "./getConcatFollowers.js";

// Follower Cache
export const followerMap = new Map<string, any>();

export async function updateFollowers() {
  console.log("[INFO] Fetching followers...");
  const actor = process.env.BSKY_IDENTIFIER!;
  try {
    const followArray = await getConcatFollowers({ actor });
    followerMap.clear();
    followArray.forEach(f => followerMap.set(f.did, f));
    console.log(`[INFO] Cached ${followerMap.size} followers.`);
  } catch (e) {
    console.error("[ERROR] Failed to update followers:", e);
  }
}
