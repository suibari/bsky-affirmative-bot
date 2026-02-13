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

  static async getBiorhythmState(): Promise<any> {
    const state = await this.getBotState('biorhythm');
    return state || {};
  }

  static async updateBiorhythmState(state: any) {
    await db.insert(bot_state)
      .values({ key: 'biorhythm', value: state })
      .onConflictDoUpdate({
        target: bot_state.key,
        set: { value: state, updated_at: new Date() }
      });
  }

  static async updateTopPost(uri: string, comment?: string) {
    const value = { uri, comment };
    await db.insert(bot_state)
      .values({ key: 'dailyTopPost', value })
      .onConflictDoUpdate({
        target: bot_state.key,
        set: { value, updated_at: new Date() }
      });
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
      await db.insert(bot_state)
        .values({ key: 'whimsical_post_root', value: uri })
        .onConflictDoUpdate({
          target: bot_state.key,
          set: { value: uri, updated_at: new Date() }
        });
    } catch (error) {
      console.error("Failed to set whimsical post root:", error);
    }
  }

  static async setQuestionState(uri: string, theme: string) {
    try {
      await Promise.all([
        db.insert(bot_state)
          .values({ key: 'question_post_uri', value: uri })
          .onConflictDoUpdate({
            target: bot_state.key,
            set: { value: uri, updated_at: new Date() }
          }),
        db.insert(bot_state)
          .values({ key: 'question_theme', value: theme })
          .onConflictDoUpdate({
            target: bot_state.key,
            set: { value: theme, updated_at: new Date() }
          })
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
    } catch (e) {
      console.error(`Failed to log interaction for ${type}:`, e);
    }
  }

  static async getDailyStats(): Promise<DailyReport> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [likesCount, affirmationsCount, repliesCount, followersCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(likes).where(gte(likes.created_at, startOfDay)),
      db.select({ count: sql<number>`count(distinct ${affirmations.did})` }).from(affirmations).where(gte(affirmations.created_at, startOfDay)),
      db.select({ count: sql<number>`count(*)` }).from(replies).where(gte(replies.created_at, startOfDay)),
      db.select({ count: sql<number>`count(*)` }).from(followers)
    ]);

    const affirmationCountTotal = await db.select({ count: sql<number>`count(*)` }).from(affirmations).where(gte(affirmations.created_at, startOfDay));

    const getInteractionCount = async (typeName: string) => {
      const result = await db.select({ count: sql<number>`count(*)` })
        .from(interaction)
        .where(and(eq(interaction.type, typeName), gte(interaction.created_at, startOfDay)));
      return Number(result[0]?.count || 0);
    };

    const [conversation, fortune, cheer, analysis, dj, anniversary, answer, recap] = await Promise.all([
      getInteractionCount('conversation'),
      getInteractionCount('fortune'),
      getInteractionCount('cheer'),
      getInteractionCount('analysis'),
      getInteractionCount('dj'),
      getInteractionCount('anniversary'),
      getInteractionCount('answer'),
      getInteractionCount('recap')
    ]);

    return {
      followers: Number(followersCount[0]?.count || 0),
      likes: Number(likesCount[0]?.count || 0),
      reply: Number(repliesCount[0]?.count || 0),
      affirmationCount: Number(affirmationCountTotal[0]?.count || 0),
      uniqueAffirmationUserCount: Number(affirmationsCount[0]?.count || 0),
      conversation,
      fortune,
      cheer,
      analysis,
      dj,
      anniversary,
      answer,
      recap,
      lang: new Map(), // Mock
      topPost: "",
      botComment: "",
      bskyrate: 0,
      rpd: 0
    } as DailyReport;
  }

  static async getTotalStats(): Promise<Stats> {
    const [likesCount, affirmationsCount, repliesCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(likes),
      db.select({ count: sql<number>`count(*)` }).from(affirmations),
      db.select({ count: sql<number>`count(*)` }).from(replies)
    ]);

    const getInteractionCount = async (typeName: string) => {
      const result = await db.select({ count: sql<number>`count(*)` })
        .from(interaction)
        .where(eq(interaction.type, typeName));
      return Number(result[0]?.count || 0);
    };

    const [conversation, fortune, cheer, analysis, dj, anniversary, answer, recap] = await Promise.all([
      getInteractionCount('conversation'),
      getInteractionCount('fortune'),
      getInteractionCount('cheer'),
      getInteractionCount('analysis'),
      getInteractionCount('dj'),
      getInteractionCount('anniversary'),
      getInteractionCount('answer'),
      getInteractionCount('recap')
    ]);

    return {
      followers: 0,
      likes: Number(likesCount[0]?.count || 0),
      reply: Number(repliesCount[0]?.count || 0),
      affirmationCount: Number(affirmationsCount[0]?.count || 0),
      conversation,
      fortune,
      cheer,
      analysis,
      dj,
      anniversary,
      answer,
      recap,
      lang: new Map()
    };
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

