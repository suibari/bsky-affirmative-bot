import { getSubscribersFromSheet } from '../packages/bot_brain/src/api/gsheet/index.js';
import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  console.log("=== [MIGRATION] Starting subscriber migration from Google Sheets to PostgreSQL ===");
  
  const connectionString = process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/postgres';
  console.log(`Connecting directly to Postgres: ${connectionString.replace(/:([^:@]+)@/, ':****@')}`);
  
  const sql = postgres(connectionString);

  try {
    // 1. Google Sheets から既存の DID を取得
    const sheetDids = await getSubscribersFromSheet();
    console.log(`[MIGRATION] Fetched ${sheetDids.length} subscribers from Google Sheets.`);

    // 2. Postgres へ直接インサート (ON CONFLICT DO NOTHING で重複防止)
    let successCount = 0;
    for (const did of sheetDids) {
      try {
        await sql`
          INSERT INTO affirmative_bot.subscribers (did, status, created_at, updated_at)
          VALUES (${did}, 'active', NOW(), NOW())
          ON CONFLICT (did) DO NOTHING
        `;
        successCount++;
      } catch (err) {
        console.error(`❌ Failed to import subscriber DID: ${did}`, err);
      }
    }
    
    console.log(`[MIGRATION] Success: Imported ${successCount} / ${sheetDids.length} subscribers.`);
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed with error:", error);
    await sql.end();
    process.exit(1);
  }
}

main();
