import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs.js";
import { getConcatFollowers } from "./getConcatFollowers.js";

// Follower Cache
export const followerMap = new Map<string, ProfileView>();

let isUpdating = false;

export async function updateFollowers() {
  if (isUpdating) return;
  isUpdating = true;

  console.log("[INFO] Fetching followers...");
  const actor = process.env.BSKY_IDENTIFIER!;
  try {
    const followArray = await getConcatFollowers({ actor });
    followerMap.clear();
    followArray.forEach(f => followerMap.set(f.did, f));
    console.log(`[INFO] Cached ${followerMap.size} followers.`);
  } catch (e) {
    console.error("[ERROR] Failed to update followers:", e);
  } finally {
    isUpdating = false;
  }
}
