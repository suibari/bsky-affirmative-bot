import { db, dbPosts, dbLikes, dbReplies, dbBotState, dbAffirmations, initializeDatabases } from './db.js';

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
      const row = await dbBotState.getRowById(key);
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
    await dbBotState.run(
      `INSERT INTO bot_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
      ['biorhythm', JSON.stringify(state)]
    );
  }

  static async updateTopPost(uri: string, comment?: string) {
    await dbBotState.run(
      `INSERT INTO bot_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
      ['dailyTopPost', JSON.stringify({ uri, comment })]
    );
  }

  static async clearReplies() {
    try {
      await dbReplies.clearAllRows();
    } catch (error) {
      console.error("Failed to clear replies:", error);
    }
  }

  static async clearPosts() {
    try {
      await dbPosts.clearAllRows();
    } catch (error) {
      console.error("Failed to clear posts:", error);
    }
  }

  static async setWhimsicalPostRoot(uri: string) {
    try {
      await dbBotState.run(
        `INSERT INTO bot_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
        ["whimsical_post_root", JSON.stringify(uri)]
      );
    } catch (error) {
      console.error("Failed to set whimsical post root:", error);
    }
  }

  static async setQuestionState(uri: string, theme: string) {
    try {
      await Promise.all([
        dbBotState.run(
          `INSERT INTO bot_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
          ["question_post_uri", JSON.stringify(uri)]
        ),
        dbBotState.run(
          `INSERT INTO bot_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
          ["question_theme", JSON.stringify(theme)]
        )
      ]);
    } catch (error) {
      console.error("Failed to set question state:", error);
    }
  }

  static async getHighestScorePosts(): Promise<any[]> {
    return await dbPosts.getAll(
      `SELECT * FROM posts WHERE score IS NOT NULL ORDER BY score DESC LIMIT 5`
    );
  }

  static async getAllPosts(): Promise<any[]> {
    return await dbPosts.getAll(`SELECT * FROM posts`);
  }

  static async getPost(did: string): Promise<any> {
    const row = await dbPosts.getRowById(did);
    return row || {};
  }

  static async upsertPost(data: any) {
    // Ensure did is present in data or passed separately?
    // Based on memory_server routes, we were doing:
    // put /posts/:did -> const data = { ...req.body, did }; await dbPosts.upsertRow(data);
    // post /posts -> await dbPosts.upsertRow(req.body);
    await dbPosts.upsertRow(data);
  }

  static async getLike(did: string): Promise<any> {
    const row = await dbLikes.getRowById(did);
    return row || {};
  }

  static async upsertLike(data: any) {
    await dbLikes.upsertRow(data);
  }

  static async deleteLike(did: string) {
    await dbLikes.deleteRow(did);
  }

  static async getReply(did: string): Promise<any> {
    const row = await dbReplies.getRowById(did);
    return row || {};
  }

  static async addReply(data: any) {
    await dbReplies.upsertRow(data);
  }

  static async upsertReply(did: string, data: any) {
    // Ensure DID match
    const rowData = { ...data, did };
    await dbReplies.upsertRow(rowData);
  }

  static async addAffirmation(data: any) {
    await dbAffirmations.insertRow(data);
  }

  static async getFollower(did: string): Promise<any> {
    const row = await db.getRowById(did);
    return row || {};
  }

  static async getFollowersByColumn(column: string, value: any): Promise<any[]> {
    return await db.selectRows(column, value);
  }

  static async updateFollower(did: string, column: string, value: any) {
    db.updateDb(did, column, value);
  }

  static async ensureFollower(did: string) {
    db.insertOrUpdateDb(did);
  }

  static async getUnreadReplies(): Promise<string[]> {
    const rows = await dbReplies.getAll(
      `SELECT reply FROM replies WHERE isRead = 0 ORDER BY RANDOM()`
    );
    return rows.map((r: any) => r.reply);
  }

  static async markRepliesRead() {
    await dbReplies.run(`UPDATE replies SET isRead = 1, updated_at = CURRENT_TIMESTAMP`);
  }

  static async getDailyStats(): Promise<DailyReport> {
    const getCount = async (dbInst: any, table: string) => {
      const row = await dbInst.getOne(
        `SELECT count(*) as count FROM ${table} WHERE created_at >= date('now', 'localtime', 'start of day')`
      );
      return row ? row.count : 0;
    };

    const getUniqueCount = async (dbInst: any, table: string, col: string) => {
      const row = await dbInst.getOne(
        `SELECT count(distinct ${col}) as count FROM ${table} WHERE created_at >= date('now', 'localtime', 'start of day')`
      );
      return row ? row.count : 0;
    };

    const [likes, affirmations, replies, followers] = await Promise.all([
      getCount(dbLikes, 'likes'),
      getUniqueCount(dbAffirmations, 'affirmations', 'did'),
      getCount(dbReplies, 'replies'),
      (async () => {
        const row = await db.getOne(`SELECT count(*) as count FROM followers`);
        return row ? row.count : 0;
      })()
    ]);

    // Total affirmations count (not unique)
    const affirmationCountTotal = await getCount(dbAffirmations, 'affirmations');

    return {
      followers: 0, // Mock
      likes: likes,
      reply: replies,
      affirmationCount: affirmationCountTotal,
      uniqueAffirmationUserCount: affirmations,
      conversation: 0,
      fortune: 0,
      cheer: 0,
      analysis: 0,
      dj: 0,
      anniversary: 0,
      answer: 0,
      recap: 0,
      lang: new Map(), // Mock
      topPost: "",
      botComment: "",
      bskyrate: 0,
      rpd: 0
    } as DailyReport;
  }

  static async getTotalStats(): Promise<Stats> {
    // Mock for now, similar to previous client
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

  static async checkRPD(): Promise<boolean> {
    try {
      const dailyStats = await this.getDailyStats();
      const replies = dailyStats.reply;
      return (replies || 0) < 300;
    } catch (e) {
      return true; // Default to true on error
    }
  }
}
