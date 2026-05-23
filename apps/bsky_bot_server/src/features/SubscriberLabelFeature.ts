import { MemoryService, botLabelerManager } from "@bsky-affirmative-bot/clients";

/**
 * Synchronizes the "bot-tan-sub" label between the PostgreSQL subscriber list and the Labeler SQLite DB.
 */
export async function syncSubscriberLabels() {
  console.log("[INFO][LABEL-SYNC] Starting subscriber label synchronization...");
  try {
    // 1. Fetch current subscribers from the Database
    const dbSubscribers = await MemoryService.getSubscribers();
    const sheetSubSet = new Set(dbSubscribers);

    // 2. Fetch currently active "bot-tan-sub" labeled DIDs from SQLite via the Labeler Server
    const activeLabelSubscribers = await botLabelerManager.getActiveLabels("bot-tan-sub");
    const activeLabelSubSet = new Set(activeLabelSubscribers);

    console.log(`[INFO][LABEL-SYNC] Current subscribers in DB: ${sheetSubSet.size}, in SQLite: ${activeLabelSubSet.size}`);

    // 3. Subscribers to add (in DB but not in SQLite)
    const toAdd = dbSubscribers.filter(did => !activeLabelSubSet.has(did));

    // 4. Subscribers to remove (in SQLite but not in DB)
    const toRemove = activeLabelSubscribers.filter(did => !sheetSubSet.has(did));

    console.log(`[INFO][LABEL-SYNC] DIDs to add: ${toAdd.length}, DIDs to remove: ${toRemove.length}`);

    // Apply new labels
    for (const did of toAdd) {
      try {
        console.log(`[INFO][LABEL-SYNC] Applying bot-tan-sub label to ${did}`);
        await botLabelerManager.applyLabel(did, "bot-tan-sub", false);
      } catch (err) {
        console.error(`[ERROR][LABEL-SYNC] Failed to apply label to ${did}:`, err);
      }
    }

    // Negate removed labels
    for (const did of toRemove) {
      try {
        console.log(`[INFO][LABEL-SYNC] Negating bot-tan-sub label for ${did}`);
        await botLabelerManager.applyLabel(did, "bot-tan-sub", true);
      } catch (err) {
        console.error(`[ERROR][LABEL-SYNC] Failed to negate label for ${did}:`, err);
      }
    }

    console.log("[INFO][LABEL-SYNC] Subscriber label synchronization finished successfully.");
  } catch (error) {
    console.error("[ERROR][LABEL-SYNC] Failed to sync subscriber labels:", error);
  }
}

/**
 * Schedules periodic synchronization of subscriber labels (every hour).
 */
export async function scheduleSubscriberLabelSync() {
  console.log("[INFO][LABEL-SYNC] Scheduling subscriber label synchronization...");

  // Synchronize every hour
  setInterval(async () => {
    await syncSubscriberLabels();
  }, 60 * 60 * 1000);

  // Initial sync with a brief 5 second delay to let the labeler server boot up first
  setTimeout(async () => {
    await syncSubscriberLabels();
  }, 5000);
}
