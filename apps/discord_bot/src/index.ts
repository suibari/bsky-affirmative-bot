import { Client, GatewayIntentBits, Events } from 'discord.js';
import { BskyAgent } from '@atproto/api';
import { db, subscribers, initializeDatabases } from '@bsky-affirmative-bot/database';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const DISCORD_TOKEN = process.env.DISCORD_TOKEN as string;
const GUILD_ID = process.env.DISCORD_GUILD_ID as string;
const ROLE_ID = process.env.DISCORD_ROLE_ID as string;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID as string;

if (!DISCORD_TOKEN || !GUILD_ID || !ROLE_ID || !CHANNEL_ID) {
  console.error("❌ [CRITICAL] Missing required Discord environment variables in .env!");
  console.error(`DISCORD_TOKEN: ${DISCORD_TOKEN ? 'Loaded' : 'Missing'}`);
  console.error(`DISCORD_GUILD_ID: ${GUILD_ID ? 'Loaded' : 'Missing'}`);
  console.error(`DISCORD_ROLE_ID: ${ROLE_ID ? 'Loaded' : 'Missing'}`);
  console.error(`DISCORD_CHANNEL_ID: ${CHANNEL_ID ? 'Loaded' : 'Missing'}`);
  process.exit(1);
}

async function startBot() {
  // 1. Initialize Database
  try {
    await initializeDatabases();
    console.log("✔ [DATABASE] Connected to PostgreSQL successfully.");
  } catch (err) {
    console.error("❌ [DATABASE] Failed to connect to database:", err);
    process.exit(1);
  }

  // 2. Initialize Discord Client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers, // Required to track role changes
      GatewayIntentBits.GuildMessages, // Required to listen to channel messages
      GatewayIntentBits.MessageContent // Required to read handles from messages
    ]
  });

  // 3. Ready Event
  client.once(Events.ClientReady, (c) => {
    console.log(`✔ [DISCORD] Ready! Logged in as ${c.user.tag}`);
  });

  // 4. Role Sync on Member Update (guildMemberUpdate)
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    // Only track changes in the designated server (Guild)
    if (newMember.guild.id !== GUILD_ID) return;

    const hadRole = oldMember.roles.cache.has(ROLE_ID);
    const hasRole = newMember.roles.cache.has(ROLE_ID);

    // If role status didn't change, do nothing
    if (hadRole === hasRole) return;

    const discordId = newMember.user.id;
    const username = newMember.user.tag;

    try {
      if (hasRole) {
        // --- 🟢 Role Added ---
        console.log(`[INFO][DISCORD] Subscriber role added to ${username} (${discordId})`);
        
        // Check if a record already exists for this Discord ID
        const existing = await db.select().from(subscribers).where(eq(subscribers.discord_id, discordId)).limit(1);
        if (existing.length > 0) {
          // If legacy record exists, reactivate it!
          await db.update(subscribers)
            .set({ status: 'active', updated_at: new Date() })
            .where(eq(subscribers.discord_id, discordId));
          console.log(`✔ [DISCORD] Reactivated existing subscriber record for ${username} (DID: ${existing[0].did})`);
        } else {
          // New subscriber, wait for them to link their handle in the designated channel
          console.log(`[INFO][DISCORD] New subscriber ${username} has no linked DID yet. Waiting for channel registration.`);
        }
      } else {
        // --- 🔴 Role Removed ---
        console.log(`[INFO][DISCORD] Subscriber role removed from ${username} (${discordId})`);
        
        // Mark their DB record as inactive so they lose their Bluesky badge automatically
        await db.update(subscribers)
          .set({ status: 'inactive', updated_at: new Date() })
          .where(eq(subscribers.discord_id, discordId));
        console.log(`✔ [DISCORD] Deactivated subscriber record for Discord ID: ${discordId}`);
      }
    } catch (err) {
      console.error(`❌ [DISCORD] Error processing role update for user ${username}:`, err);
    }
  });

  // 5. Handle Linking on Message (messageCreate)
  client.on(Events.MessageCreate, async (message) => {
    // Filter messages to only look in the designated channel and ignore other bots
    if (message.channelId !== CHANNEL_ID || message.author.bot) return;

    const member = message.member;
    if (!member) return;

    const discordId = message.author.id;
    const username = message.author.tag;

    // A. Verify if the sender has the required premium subscriber role
    if (!member.roles.cache.has(ROLE_ID)) {
      await message.reply("❌ This feature is only available to premium subscribers (e.g. Patreon/FANBOX members with the verified role). Please make sure you have the synchronized role!");
      return;
    }

    // B. Parse handle from message content (e.g. "@Bot suibari.bsky.social" -> "suibari.bsky.social")
    const text = message.content.replace(/<@!?\d+>/g, '').trim(); // Remove bot mentions
    const handleRegex = /([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
    const match = text.match(handleRegex);

    if (!match) {
      await message.reply("❌ Please provide a valid Bluesky handle (e.g., `yourname.bsky.social`).");
      return;
    }

    const handle = match[1].toLowerCase();
    console.log(`[INFO][DISCORD] Link request from ${username} for handle: ${handle}`);

    // C. Resolve Bluesky handle to DID
    const agent = new BskyAgent({ service: 'https://bsky.social' });
    try {
      const response = await agent.resolveHandle({ handle });
      const did = response.data.did;
      console.log(`✔ [DISCORD] Resolved handle ${handle} to DID: ${did}`);

      // D. Link/Upsert the subscriber record in PostgreSQL
      const existingByDiscord = await db.select().from(subscribers).where(eq(subscribers.discord_id, discordId)).limit(1);
      const existingByDid = await db.select().from(subscribers).where(eq(subscribers.did, did)).limit(1);

      if (existingByDiscord.length > 0) {
        // Update existing record for this Discord ID
        await db.update(subscribers)
          .set({ did: did, status: 'active', updated_at: new Date() })
          .where(eq(subscribers.discord_id, discordId));
        console.log(`✔ [DISCORD] Updated DID for Discord ID ${discordId} to ${did}`);
      } else if (existingByDid.length > 0) {
        // Link Discord ID to a legacy DID record (imported from Google Sheets)
        await db.update(subscribers)
          .set({ discord_id: discordId, status: 'active', updated_at: new Date() })
          .where(eq(subscribers.did, did));
        console.log(`✔ [DISCORD] Linked Discord ID ${discordId} to existing DID record: ${did}`);
      } else {
        // Create a completely new subscriber record
        await db.insert(subscribers).values({
          discord_id: discordId,
          did: did,
          status: 'active',
          updated_at: new Date()
        });
        console.log(`✔ [DISCORD] Created new subscriber record: Discord ${discordId} ↔ DID ${did}`);
      }

      await message.reply(`🎉 **Your Bluesky account has been successfully registered to the Bot-tan server!**\n\n*   **Registered Account**: \`@${handle}\`\n*   **DID**: \`${did}\`\n\n※ Your custom subscriber badge (bot-tan-sub) will be automatically synchronized and applied to your Bluesky profile within an hour. Enjoy!`);

    } catch (err: any) {
      console.error(`❌ [DISCORD] Failed to resolve handle @${handle}:`, err.message || err);
      await message.reply(`❌ Failed to resolve Bluesky account \`@${handle}\`. Please verify that your handle is spelled correctly.\n(Error: ${err.message || 'Unknown'})`);
    }
  });

  // 6. Connect/Login to Discord
  client.login(DISCORD_TOKEN);
}

startBot().catch(err => {
  console.error("❌ [CRITICAL] Discord Bot crashed on startup:", err);
});
