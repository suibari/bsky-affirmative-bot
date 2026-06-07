import { MemoryService, botLabelerManager } from "@bsky-affirmative-bot/clients";

/**
 * Synchronizes the "team-affirmation" label between the PostgreSQL subscriber list
 * (status IN 'active' | 'discord_only') and the Labeler SQLite DB.
 */
export async function syncSubscriberLabels() {
  console.log("[INFO][LABEL-SYNC] Starting subscriber label synchronization...");
  try {
    // 1. Fetch current subscribers from the Database
    const dbSubscribers = await MemoryService.getSubscribersOrDeveloper();
    const sheetSubSet = new Set(dbSubscribers);

    // 2. Fetch currently active "team-affirmation" labeled DIDs from SQLite via the Labeler Server
    const activeLabelSubscribers = await botLabelerManager.getActiveLabels("team-affirmation");
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
        console.log(`[INFO][LABEL-SYNC] Applying team-affirmation label to ${did}`);
        await botLabelerManager.applyLabel(did, "team-affirmation", false);
      } catch (err) {
        console.error(`[ERROR][LABEL-SYNC] Failed to apply label to ${did}:`, err);
      }
    }

    // Negate removed labels
    for (const did of toRemove) {
      try {
        console.log(`[INFO][LABEL-SYNC] Negating team-affirmation label for ${did}`);
        await botLabelerManager.applyLabel(did, "team-affirmation", true);
      } catch (err) {
        console.error(`[ERROR][LABEL-SYNC] Failed to negate label for ${did}:`, err);
      }
    }

    console.log("[INFO][LABEL-SYNC] Subscriber label synchronization finished successfully.");
  } catch (error) {
    console.error("[ERROR][LABEL-SYNC] Failed to sync subscriber labels:", error);
  }
}

// bot-tan-sub から team-affirmation への移行時に一度だけ実行。
// bot-tan-sub は永続ラベルのため明示的に negate しなければ残り続ける。
async function migrateBotTanSubLabels() {
  try {
    const activeBotTanSubs = await botLabelerManager.getActiveLabels("bot-tan-sub");
    if (activeBotTanSubs.length === 0) return;
    console.log(`[INFO][LABEL-MIGRATE] Negating ${activeBotTanSubs.length} bot-tan-sub label(s)...`);
    for (const did of activeBotTanSubs) {
      await botLabelerManager.applyLabel(did, "bot-tan-sub", true);
    }
    console.log("[INFO][LABEL-MIGRATE] bot-tan-sub migration complete.");
  } catch (error) {
    console.error("[ERROR][LABEL-MIGRATE] Failed to migrate bot-tan-sub labels:", error);
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
    await migrateBotTanSubLabels();
    await syncSubscriberLabels();
  }, 5000);
}
