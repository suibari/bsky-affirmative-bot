import { MemoryService } from "@bsky-affirmative-bot/clients";
import { BiorhythmManager } from "./manager.js";

const INTERVAL_MS = 3 * 60 * 1000;

async function syncRoomInteractions(manager: BiorhythmManager): Promise<void> {
  try {
    const pending = await MemoryService.getPendingInteractionFollowers();
    if (pending.length === 0) return;

    console.log(`[INFO][ROOM_INTERACT] Found ${pending.length} pending interaction(s).`);
    for (const f of pending) {
      const count = f.room_interaction_count ?? 0;
      try {
        await manager.addRoomInteraction(count);
        await MemoryService.updateFollower(f.did, "room_interaction_count", 0);
        console.log(`[INFO][ROOM_INTERACT] Applied +${count} energy for ${f.did}`);
      } catch (e: any) {
        console.error(`[ERROR][ROOM_INTERACT] Failed for ${f.did}:`, e.message);
      }
    }
  } catch (e: any) {
    console.error(`[ERROR][ROOM_INTERACT] sync crashed:`, e.message);
  }
}

export function scheduleRoomInteractionSync(manager: BiorhythmManager): void {
  console.log("[INFO][ROOM_INTERACT] Scheduling room interaction sync...");
  setInterval(() => syncRoomInteractions(manager), INTERVAL_MS);
  // 起動直後に1回実行して取りこぼしを防ぐ
  setTimeout(() => syncRoomInteractions(manager), 5000);
}
