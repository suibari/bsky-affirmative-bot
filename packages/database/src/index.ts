import { db, initializeDatabases, bot_state, followers, posts, likes, replies, affirmations, interaction } from './db.js';
import { eq, desc, sql, gte, and } from 'drizzle-orm';
import { LanguageName } from '@bsky-affirmative-bot/shared-configs';

export { initializeDatabases };

export interface DailyReport {
  followers: number;
  likes: number;
  reply: number;
  affirmationCount: number;
  uniqueAffirmationUserCount: number;
  conversation: number;
  fortune: number;
  cheer: number;
  analysis: number;
  dj: number;
  anniversary: number;
  answer: number;
  recap: number;
  lang: Map<LanguageName, number>;
  topPost: string;
  botComment: string;
  bskyrate: number;
  rpd: number;
}

export interface Stats {
  followers: number;
  likes: number;
  reply: number;
  affirmationCount: number;
  conversation: number;
  fortune: number;
  cheer: number;
  analysis: number;
  dj: number;
  anniversary: number;
  answer: number;
  recap: number;
  lang: Map<LanguageName, number>;
}

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
    await this.setBotState('biorhythm', state);
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
      await db.delete(posts);
    } catch (error) {
      console.error("Failed to clear posts:", error);
    }
  }

  static async setWhimsicalPostRoot(uri: string) {
    try {
      await this.setBotState('whimsical_post_root', uri);
    } catch (error) {
      console.error("Failed to set whimsical post root:", error);
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

  static async getAllPosts(): Promise<any[]> {
    return await db.select().from(posts);
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
    const rowData = { ...data, did };
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

  static async getUnreadReplies(): Promise<string[]> {
    const result = await db.select({ reply: replies.reply })
      .from(replies)
      .where(eq(replies.isRead, 0))
      .orderBy(sql`RANDOM()`);
    return result.map(r => r.reply).filter((r): r is string => !!r);
  }

  static async markRepliesRead() {
    await db.update(replies)
      .set({ isRead: 1, updated_at: new Date() });
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

  private static async incrementStats(type: string, amount: number = 1) {
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
      lang: new Map()
    };
  }

  static async resetDailyStats() {
    try {
      const totalStats = await this.getStatsWithMap('totalStats');
      await this.saveStatsWithMap('yesterdayStats', totalStats);
    } catch (e) {
      console.error("Failed to reset daily stats:", e);
    }
  }

  static async getDailyStats(): Promise<DailyReport> {
    const totalStats = await this.getStatsWithMap('totalStats');
    const yesterdayStats = await this.getStatsWithMap('yesterdayStats');
    const dailyTopPostData = await this.getBotState('dailyTopPost');

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

    return {
      followers: totalStats.followers,
      likes: diff('likes'),
      reply: diff('reply'),
      affirmationCount: diff('affirmationCount'),
      uniqueAffirmationUserCount: diff('affirmationCount'),
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
      bskyrate: 0,
      rpd: 0
    } as DailyReport;
  }

  static async getTotalStats(): Promise<Stats> {
    return await this.getStatsWithMap('totalStats');
  }

  static async checkRPD(): Promise<boolean> {
    try {
      const dailyStats = await this.getDailyStats();
      const repliesCount = dailyStats.reply;
      return (repliesCount || 0) < 300;
    } catch (e) {
      return true; // Default to true on error
    }
  }
}

