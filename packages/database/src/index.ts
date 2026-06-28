import { db, initializeDatabases, bot_state, followers, posts, likes, replies, affirmations, interaction, subscribers, biorhythm_history, gifts, youtube_shorts } from './db.js';
import { eq, desc, sql, gte, lte, and, gt, inArray, lt } from 'drizzle-orm';
import { generateEmbedding } from './ollamaEmbed.js';
import { LanguageName, LIMIT_REQUEST_PER_DAY_GEMINI, DailyReport, Stats } from '@bsky-affirmative-bot/shared-configs';

export { initializeDatabases, db, subscribers };
export { filterRelatedHistory } from './ollamaEmbed.js';
export type { DailyReport, Stats };

export class MemoryService {
  static async getBotState(key: string): Promise<any> {
    try {
      const result = await db.select().from(bot_state).where(eq(bot_state.key, key)).limit(1);
      const row = result[0];
      if (row && typeof row.value === 'string') {
        try {
          return JSON.parse(row.value);
        } catch {
          return row.value;
        }
      }
      return row ? row.value : null;
    } catch (e) {
      console.error(`Failed to get bot state for ${key}`, e);
      return null;
    }
  }

  static async setBotState(key: string, value: any) {
    await db.insert(bot_state)
      .values({ key, value })
      .onConflictDoUpdate({
        target: bot_state.key,
        set: { value, updated_at: new Date() }
      });
  }

  static async getBiorhythmState(): Promise<any> {
    const state = await this.getBotState('biorhythm');
    return state || {};
  }

  static async updateBiorhythmState(state: any) {
    const currentState = await this.getBiorhythmState();
    const newState = { ...currentState, ...state };
    await this.setBotState('biorhythm', newState);
  }

  static async updateTopPost(uri: string, comment?: string) {
    await this.setBotState('dailyTopPost', { uri, comment });
  }

  static async clearReplies() {
    try {
      await db.delete(replies);
    } catch (error) {
      console.error("Failed to clear replies:", error);
    }
  }

  static async clearPosts() {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      await db.delete(posts).where(lt(posts.created_at, sevenDaysAgo));
      console.log("[INFO] Pruned posts older than 7 days.");
    } catch (error) {
      console.error("Failed to prune old posts:", error);
    }
  }

  static async setWhimsicalPostRoot(uri: string) {
    try {
      await this.setBotState('whimsical_post_root', uri);
    } catch (error) {
      console.error("Failed to set whimsical post root:", error);
    }
  }

  static async setWhimsicalPostRoots(uris: string[]) {
    try {
      await this.setBotState('whimsical_post_roots', uris);
    } catch (error) {
      console.error("Failed to set whimsical post roots:", error);
    }
  }

  static async setQuestionState(uri: string, theme: string) {
    try {
      await Promise.all([
        this.setBotState('question_post_uri', uri),
        this.setBotState('question_theme', theme)
      ]);
    } catch (error) {
      console.error("Failed to set question state:", error);
    }
  }

  static async getHighestScorePosts(): Promise<any[]> {
    return await db.select().from(posts).orderBy(desc(posts.score)).limit(5);
  }

static async getPost(did: string): Promise<any> {
    const result = await db.select().from(posts).where(eq(posts.did, did)).limit(1);
    return result[0] || {};
  }

  static async upsertPost(data: any) {
    await db.insert(posts)
      .values(data)
      .onConflictDoUpdate({
        target: posts.did,
        set: data
      });

    if (data.post) {
      generateEmbedding(data.post).then(async (embedding) => {
        if (embedding) {
          await db.update(posts).set({ embedding }).where(eq(posts.did, data.did));
        }
      }).catch((e) => console.error("[ERROR][upsertPost] embedding failed:", e));
    }
  }

  static async findFollowersByTopic(
    text: string,
    excludeDid?: string,
    threshold: number = 0.8
  ): Promise<Array<{ uri: string | null; did: string; post: string | null; score: number | null }>> {
    const embedding = await generateEmbedding(text);
    if (!embedding) return [];

    try {
      const vectorLiteral = `[${embedding.join(",")}]`;
      const maxDistance = 1 - threshold;
      const conditions = [
        sql`"embedding" IS NOT NULL`,
        sql`"embedding" <=> ${sql.raw(`'${vectorLiteral}'::vector`)} <= ${maxDistance}`,
        ...(excludeDid ? [sql`did != ${excludeDid}`] : []),
      ];
      return await db.select({ uri: posts.uri, did: posts.did, post: posts.post, score: posts.score })
        .from(posts)
        .where(sql.join(conditions, sql` AND `))
        .orderBy(sql`"embedding" <=> ${sql.raw(`'${vectorLiteral}'::vector`)}`)
        .limit(10);
    } catch (e) {
      console.error("[ERROR][findFollowersByTopic]", e);
      return [];
    }
  }

  static async getLike(did: string): Promise<any> {
    const result = await db.select().from(likes).where(eq(likes.did, did)).limit(1);
    return result[0] || {};
  }

  static async upsertLike(data: any) {
    await db.insert(likes)
      .values(data)
      .onConflictDoUpdate({
        target: likes.did,
        set: data
      });
    // Log interaction
    await this.logUsage('like', data.did);
  }

  static async deleteLike(did: string) {
    await db.delete(likes).where(eq(likes.did, did));
  }

  static async getReply(did: string): Promise<any> {
    const result = await db.select().from(replies).where(eq(replies.did, did)).limit(1);
    return result[0] || {};
  }

  static async addReply(data: any) {
    await db.insert(replies)
      .values(data)
      .onConflictDoUpdate({
        target: replies.did,
        set: data
      });
  }

  static async upsertReply(did: string, data: any) {
    const rowData = { ...data, did, updated_at: new Date() };
    await db.insert(replies)
      .values(rowData)
      .onConflictDoUpdate({
        target: replies.did,
        set: rowData
      });
  }

  static async addAffirmation(data: any) {
    await db.insert(affirmations).values(data);
    await this.logUsage('affirmation', data.did);
  }

  static async getFollower(did: string): Promise<any> {
    const result = await db.select().from(followers).where(eq(followers.did, did)).limit(1);
    return result[0] || {};
  }

  static async getFollowersByColumn(column: string, value: any): Promise<any[]> {
    return await db.select().from(followers).where(sql`${sql.identifier(column)} = ${value}`);
  }

  static async getPendingBadgeFollowers(): Promise<any[]> {
    return await db.select().from(followers).where(eq(followers.room_badge_pending, 1));
  }

  static async getPendingInteractionFollowers(): Promise<{ did: string; room_interaction_count: number | null }[]> {
    return await db
      .select({ did: followers.did, room_interaction_count: followers.room_interaction_count })
      .from(followers)
      .where(gt(followers.room_interaction_count, 0));
  }

  static async updateFollower(did: string, column: string, value: any) {
    await db.update(followers)
      .set({ [column]: value, updated_at: new Date() })
      .where(eq(followers.did, did));
  }

  static async ensureFollower(did: string) {
    const existing = await this.getFollower(did);
    await db.insert(followers)
      .values({ did })
      .onConflictDoNothing();

    // Log interaction if it's a new follower
    if (!existing.did) {
      await this.logUsage('follow', did);
      await this.logUsage('followers', did); // Increment followers count separately
    }
  }

  static async upsertFollowerInteraction(did: string) {
    await db.insert(followers)
      .values({ did, updated_at: new Date() })
      .onConflictDoUpdate({
        target: followers.did,
        set: { updated_at: new Date() }
      });
  }

  static async getUnreadReplies(): Promise<string[]> {
    const result = await db.select({ reply: replies.reply })
      .from(replies)
      .where(eq(replies.isRead, 0))
      .orderBy(sql`RANDOM()`);
    return result.map(r => r.reply).filter((r): r is string => !!r);
  }

  static async markRepliesRead() {
    await db.update(replies)
      .set({ isRead: 1 })
      .where(eq(replies.isRead, 0));
  }

  static async logUsage(type: string, did: string | null, details?: any) {
    try {
      await db.insert(interaction).values({
        type,
        did,
        details: details || null
      });

      await this.incrementStats(type);

    } catch (e) {
      console.error(`Failed to log interaction for ${type}:`, e);
    }
  }

  private static async getStatsWithMap(key: string): Promise<Stats> {
    const stats = (await this.getBotState(key)) as Stats || this.getEmptyStats();
    if (!(stats.lang instanceof Map)) {
      stats.lang = new Map<LanguageName, number>(Object.entries(stats.lang || {}) as [LanguageName, number][]);
    }
    return stats;
  }

  private static async saveStatsWithMap(key: string, stats: Stats) {
    // Convert Map to Object for storage if needed, but we modify the stats object in place usually
    // Let's ensure we don't mutate the Map in a way that breaks JSON if we just rely on default serialization?
    // Drizzle jsonb handles objects. Maps serialize to {} by default in JSON.stringify.
    // So we MUST convert Map to Object before saving.
    const statsToSave = { ...stats };
    if (stats.lang instanceof Map) {
      statsToSave.lang = Object.fromEntries(stats.lang) as any;
    }
    await this.setBotState(key, statsToSave);
  }

  static async incrementStats(type: string, amount: number = 1) {
    try {
      const currentStats = await this.getStatsWithMap('totalStats');

      // Update specific stat
      if (type === 'followers') currentStats.followers += amount;
      else if (type === 'like') currentStats.likes += amount;
      else if (type === 'reply') currentStats.reply += amount;
      else if (type === 'affirmation') currentStats.affirmationCount += amount;
      else if (type === 'conversation') currentStats.conversation += amount;
      else if (type === 'fortune') currentStats.fortune += amount;
      else if (type === 'cheer') currentStats.cheer += amount;
      else if (type === 'analysis') currentStats.analysis += amount;
      else if (type === 'dj') currentStats.dj += amount;
      else if (type === 'anniversary') currentStats.anniversary += amount;
      else if (type === 'answer') currentStats.answer += amount;
      else if (type === 'recap') currentStats.recap += amount;
      else if (type === 'rpd') currentStats.rpd += amount;
      else if (type === 'rpdError') currentStats.rpdError += amount;
      else if (type === 'bskyrate') currentStats.bskyrate += amount;

      await this.saveStatsWithMap('totalStats', currentStats);
    } catch (e) {
      console.error(`Failed to increment stats for ${type}:`, e);
    }
  }

  static async incrementLang(langName: LanguageName) {
    try {
      const currentStats = await this.getStatsWithMap('totalStats');

      const count = currentStats.lang.get(langName) || 0;
      currentStats.lang.set(langName, count + 1);

      await this.saveStatsWithMap('totalStats', currentStats);
    } catch (e) {
      console.error(`Failed to increment lang for ${langName}:`, e);
    }
  }

  static getEmptyStats(): Stats {
    return {
      followers: 0,
      likes: 0,
      reply: 0,
      affirmationCount: 0,
      conversation: 0,
      fortune: 0,
      cheer: 0,
      analysis: 0,
      dj: 0,
      anniversary: 0,
      answer: 0,
      recap: 0,
      lang: new Map(),
      bskyrate: 0,
      rpd: 0,
      rpdError: 0
    };
  }

  static async resetDailyStats() {
    try {
      const totalStats = await this.getStatsWithMap('totalStats');
      await this.saveStatsWithMap('yesterdayStats', totalStats);
      await this.setBotState('stats_last_reset_at', new Date().toISOString());
    } catch (e) {
      console.error("Failed to reset daily stats:", e);
    }
  }

  static async getDailyStats(): Promise<DailyReport> {
    const totalStats = await this.getStatsWithMap('totalStats');
    const yesterdayStats = await this.getStatsWithMap('yesterdayStats');
    const dailyTopPostData = await this.getBotState('dailyTopPost');
    const lastResetAt = await this.getBotState('stats_last_reset_at');

    const lastResetDate = lastResetAt ? new Date(lastResetAt) : new Date();

    const diff = (key: keyof Stats) => {
      const total = (totalStats[key] as number) || 0;
      const yesterday = (yesterdayStats[key] as number) || 0;
      return total - yesterday;
    };

    const getLangDiff = () => {
      const tMap = totalStats.lang;
      const yMap = yesterdayStats.lang;
      const diffMap = new Map<LanguageName, number>();

      tMap.forEach((v: number, k: LanguageName) => {
        const yVal = yMap.get(k) || 0;
        diffMap.set(k, v - yVal);
      });
      return diffMap;
    };

    // Calculate unique affirmations since last reset
    let uniqueAffirmationCount = 0;
    try {
      const result = await db.select({ count: sql`count(distinct ${affirmations.did})` })
        .from(affirmations)
        .where(gte(affirmations.created_at, lastResetDate));
      uniqueAffirmationCount = Number(result[0]?.count || 0);
    } catch (e) {
      console.error("Failed to get unique affirmation count:", e);
    }

    return {
      followers: diff('followers'),
      likes: diff('likes'),
      reply: diff('reply'),
      affirmationCount: diff('affirmationCount'),
      uniqueAffirmationUserCount: uniqueAffirmationCount,
      conversation: diff('conversation'),
      fortune: diff('fortune'),
      cheer: diff('cheer'),
      analysis: diff('analysis'),
      dj: diff('dj'),
      anniversary: diff('anniversary'),
      answer: diff('answer'),
      recap: diff('recap'),
      lang: getLangDiff(),
      topPost: dailyTopPostData?.uri || "",
      botComment: dailyTopPostData?.comment || "",
      bskyrate: diff('bskyrate'),
      rpd: diff('rpd'),
      rpdError: diff('rpdError'),
      lastInitializedDate: lastResetAt || new Date().toISOString()
    } as DailyReport;
  }

  static async getTotalStats(): Promise<any> {
    const stats = await this.getStatsWithMap('totalStats');
    return {
      ...stats,
      lang: Object.fromEntries(stats.lang)
    };
  }

  static async checkRPD(): Promise<boolean> {
    try {
      const dailyStats = await this.getDailyStats();
      const rpdCount = dailyStats.rpd || 0;
      const repliesCount = dailyStats.reply || 0;

      // Gemini RPD limit check
      if (rpdCount >= LIMIT_REQUEST_PER_DAY_GEMINI) {
        console.warn(`[WARN] Gemini RPD limit reached (${rpdCount}/${LIMIT_REQUEST_PER_DAY_GEMINI})`);
        return false;
      }

      // Safety limit for replies (300)
      // if (repliesCount >= 300) {
      //   console.warn(`[WARN] Reply limit reached (${repliesCount}/300)`);
      //   return false;
      // }

      return true;
    } catch (e) {
      console.error("Error in checkRPD:", e);
      return true; // Default to true on error
    }
  }

  static async getSubscribersOrDeveloper(): Promise<string[]> {
    try {
      const result = await db.select({ did: subscribers.did })
        .from(subscribers)
        .where(eq(subscribers.status, 'active'));
      const list = result.map(row => row.did);

      const devDid = process.env.DEVELOPER_DID;
      if (devDid) {
        const devDids = devDid.split(',').map(d => d.trim()).filter(Boolean);
        for (const did of devDids) {
          if (!list.includes(did)) {
            list.push(did);
          }
        }
      }
      return list;
    } catch (e) {
      console.error("Failed to get subscribers or developer from database:", e);
      return [];
    }
  }

  static async getCommunityMembersOrDeveloper(): Promise<string[]> {
    try {
      const result = await db.select({ did: subscribers.did })
        .from(subscribers)
        .where(inArray(subscribers.status, ['active', 'discord_only']));
      const list = result.map(row => row.did);

      const devDid = process.env.DEVELOPER_DID;
      if (devDid) {
        const devDids = devDid.split(',').map(d => d.trim()).filter(Boolean);
        for (const did of devDids) {
          if (!list.includes(did)) {
            list.push(did);
          }
        }
      }
      return list;
    } catch (e) {
      console.error("Failed to get community members or developer from database:", e);
      return [];
    }
  }

  static async getSubscriberDidsIncludingInactive(): Promise<string[]> {
    try {
      const result = await db.select({ did: subscribers.did })
        .from(subscribers);
      return result.map(row => row.did);
    } catch (e) {
      console.error("Failed to get subscriber DIDs including inactive:", e);
      return [];
    }
  }

  static async addSubscriber(did: string, discordId?: string) {
    try {
      const data = {
        did,
        discord_id: discordId || null,
        status: 'active',
        updated_at: new Date()
      };
      await db.insert(subscribers)
        .values(data)
        .onConflictDoUpdate({
          target: subscribers.did,
          set: data
        });
      console.log(`[INFO] Subscriber added/updated in DB: ${did} (Discord: ${discordId || 'N/A'})`);
    } catch (e) {
      console.error(`Failed to add subscriber for ${did}:`, e);
      throw e;
    }
  }

  static async removeSubscriberByDid(did: string) {
    try {
      await db.update(subscribers)
        .set({ status: 'inactive', updated_at: new Date() })
        .where(eq(subscribers.did, did));
      console.log(`[INFO] Subscriber deactivated in DB by DID: ${did}`);
    } catch (e) {
      console.error(`Failed to deactivate subscriber by DID ${did}:`, e);
      throw e;
    }
  }

  static async removeSubscriberByDiscordId(discordId: string) {
    try {
      await db.update(subscribers)
        .set({ status: 'inactive', updated_at: new Date() })
        .where(eq(subscribers.discord_id, discordId));
      console.log(`[INFO] Subscriber deactivated in DB by Discord ID: ${discordId}`);
    } catch (e) {
      console.error(`Failed to deactivate subscriber by Discord ID ${discordId}:`, e);
      throw e;
    }
  }

  static async getDiscordLinkedSubscriberIds(): Promise<string[]> {
    try {
      const result = await db.select({ discord_id: subscribers.discord_id })
        .from(subscribers)
        .where(
          and(
            inArray(subscribers.status, ['active', 'discord_only']),
            sql`${subscribers.discord_id} IS NOT NULL`
          )
        );
      return result.map(row => row.discord_id as string);
    } catch (e) {
      console.error("Failed to get Discord-linked subscriber IDs:", e);
      return [];
    }
  }

  static async updateSubscriberStatus(did: string, status: 'active' | 'inactive' | 'discord_only') {
    try {
      await db.update(subscribers)
        .set({ status, updated_at: new Date() })
        .where(eq(subscribers.did, did));
      console.log(`[INFO] Subscriber status updated to ${status} for DID: ${did}`);
    } catch (e) {
      console.error(`Failed to update subscriber status for ${did}:`, e);
      throw e;
    }
  }

  static async addBiorhythmHistory(status: string, mood: string, mood_en: string, energy: number) {
    try {
      await db.insert(biorhythm_history).values({ status, mood, mood_en, energy });
    } catch (e) {
      console.error("Failed to add biorhythm history:", e);
    }
  }

  static async getBiorhythmHistorySince(since: Date): Promise<any[]> {
    try {
      return await db.select()
        .from(biorhythm_history)
        .where(gte(biorhythm_history.created_at, since))
        .orderBy(biorhythm_history.created_at);
    } catch (e) {
      console.error("Failed to get biorhythm history since:", since, e);
      return [];
    }
  }

  static async getInteractionsSince(since: Date): Promise<any[]> {
    try {
      return await db.select()
        .from(interaction)
        .where(gte(interaction.created_at, since))
        .orderBy(interaction.created_at);
    } catch (e) {
      console.error("Failed to get interactions since:", since, e);
      return [];
    }
  }

  static async getTodayNewGifts(): Promise<any[]> {
    try {
      const todayStart = new Date();
      if (todayStart.getHours() < 4) {
        todayStart.setDate(todayStart.getDate() - 1);
      }
      todayStart.setHours(4, 0, 0, 0);
      return await db.select()
        .from(gifts)
        .where(and(eq(gifts.status, 'new'), gte(gifts.created_at, todayStart)))
        .orderBy(gifts.created_at);
    } catch (e) {
      console.error("Failed to get today's new gifts:", e);
      return [];
    }
  }

  static async getRandomOldGift(): Promise<any | null> {
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const result = await db.select()
        .from(gifts)
        .where(lte(gifts.updated_at, threeDaysAgo))
        .orderBy(sql`RANDOM()`)
        .limit(1);
      return result[0] ?? null;
    } catch (e) {
      console.error("Failed to get random old gift:", e);
      return null;
    }
  }

  static async updateGiftStatus(id: number, status: "introduced" | "used"): Promise<void> {
    try {
      await db.update(gifts)
        .set({ status, updated_at: new Date() })
        .where(eq(gifts.id, id));
    } catch (e) {
      console.error(`Failed to update gift status for id ${id}:`, e);
    }
  }

  static async getNewYoutubeShort(): Promise<{ id: number; url: string; title: string | null } | null> {
    try {
      const result = await db.select()
        .from(youtube_shorts)
        .where(eq(youtube_shorts.status, 'new'))
        .orderBy(desc(youtube_shorts.created_at))
        .limit(1);
      return result[0] ?? null;
    } catch (e) {
      console.error("Failed to get new YouTube Short:", e);
      return null;
    }
  }

  static async updateYoutubeShortStatus(id: number, status: "posted"): Promise<void> {
    try {
      await db.update(youtube_shorts)
        .set({ status, updated_at: new Date() })
        .where(eq(youtube_shorts.id, id));
    } catch (e) {
      console.error(`Failed to update YouTube Short status for id ${id}:`, e);
    }
  }
}

