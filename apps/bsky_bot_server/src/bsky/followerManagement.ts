import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs.js";
import { getConcatFollowers } from "./getConcatFollowers.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// フォロワーのキャッシュ用Map
export const followerMap = new Map<string, ProfileView>();

let isUpdating = false;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/bsky/ followerManagement.ts または dist/bsky/ followerManagement.js のいずれからでも
// apps/bsky_bot_server/ 直下の followers_cache.json を指すようにパスを計算
const CACHE_FILE = path.join(__dirname, "../..", "followers_cache.json");

/**
 * ファイルキャッシュからフォロワー情報を復元する
 */
export async function loadFollowersFromCache() {
  try {
    const data = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(data) as [string, ProfileView][];
    followerMap.clear();
    for (const [did, profile] of parsed) {
      followerMap.set(did, profile);
    }
    console.log(`[INFO] Loaded ${followerMap.size} followers from cache file.`);
  } catch (e) {
    // "as any" キャストを避けるため、型安全にプロパティ存在チェックを行う
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
      console.log("[INFO] No follower cache file found. Starting empty.");
    } else {
      console.error("[ERROR] Failed to load followers from cache file:", e);
    }
  }
}

/**
 * フォロワー情報をファイルキャッシュに保存する
 */
async function saveFollowersToCache() {
  try {
    const entries = Array.from(followerMap.entries());
    const data = JSON.stringify(entries, null, 2);
    await fs.writeFile(CACHE_FILE, data, "utf-8");
    console.log("[INFO] Follower cache saved to file.");
  } catch (e) {
    console.error("[ERROR] Failed to save followers to cache file:", e);
  }
}

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

    // 最新フォロワー情報の取得が完了したら、ファイルキャッシュへ書き出す
    await saveFollowersToCache();
  } catch (e) {
    console.error("[ERROR] Failed to update followers:", e);
  } finally {
    isUpdating = false;
  }
}
