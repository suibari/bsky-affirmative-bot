export * from './bsky.js';
import axios from 'axios';
import { DailyReport, Stats } from '@bsky-affirmative-bot/shared-configs';

// Ensure MEMORY_SERVER_URL is in .env, default to localhost:3000
const MEMORY_SERVER_URL = process.env.MEMORY_SERVER_URL || 'http://localhost:3000';

export class MemoryService {
  static async getBotState(key: string): Promise<any> {
    try {
      const res = await axios.get(`${MEMORY_SERVER_URL}/state/${key}`);
      return res.data.value; // Routes.ts returns { key, value, updated_at }
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
    await axios.post(`${MEMORY_SERVER_URL}/state/biorhythm`, { value: state });
  }

  static async updateTopPost(uri: string, comment?: string) {
    await axios.post(`${MEMORY_SERVER_URL}/state/dailyTopPost`, { value: { uri, comment } });
  }

  static async clearReplies() {
    try {
      await axios.post(`${MEMORY_SERVER_URL}/replies/clear`);
    } catch (error) {
      console.error("Failed to clear replies:", error);
    }
  }

  static async clearPosts() {
    try {
      await axios.post(`${MEMORY_SERVER_URL}/posts/clear`);
    } catch (error) {
      console.error("Failed to clear posts:", error);
    }
  }

  static async setWhimsicalPostRoot(uri: string) {
    try {
      await axios.post(`${MEMORY_SERVER_URL}/state/whimsical-root`, { uri });
    } catch (error) {
      console.error("Failed to set whimsical post root:", error);
    }
  }

  static async setQuestionState(uri: string, theme: string) {
    try {
      await axios.post(`${MEMORY_SERVER_URL}/state/question`, { uri, theme });
    } catch (error) {
      console.error("Failed to set question state:", error);
    }
  }

  static async getHighestScorePosts(): Promise<any[]> {
    const res = await axios.get(`${MEMORY_SERVER_URL}/posts/highest-score`);
    return res.data;
  }

  static async getAllPosts(): Promise<any[]> {
    const res = await axios.get(`${MEMORY_SERVER_URL}/posts`);
    return res.data;
  }

  static async getPost(did: string): Promise<any> {
    const res = await axios.get(`${MEMORY_SERVER_URL}/posts/${did}`);
    return res.data;
  }

  static async upsertPost(data: any) {
    if (data.did) {
      await axios.put(`${MEMORY_SERVER_URL}/posts/${data.did}`, data);
    } else {
      await axios.post(`${MEMORY_SERVER_URL}/posts`, data);
    }
  }

  static async getLike(did: string): Promise<any> {
    const res = await axios.get(`${MEMORY_SERVER_URL}/likes/${did}`);
    return res.data;
  }

  static async upsertLike(data: any) {
    await axios.post(`${MEMORY_SERVER_URL}/likes`, data);
  }

  static async deleteLike(did: string) {
    await axios.delete(`${MEMORY_SERVER_URL}/likes/${did}`);
  }

  static async getReply(did: string): Promise<any> {
    const res = await axios.get(`${MEMORY_SERVER_URL}/replies/${did}`);
    return res.data;
  }

  static async addReply(data: any) {
    await axios.post(`${MEMORY_SERVER_URL}/replies`, data);
  }

  static async upsertReply(did: string, data: any) {
    await axios.put(`${MEMORY_SERVER_URL}/replies/${did}`, data);
  }

  static async addAffirmation(data: any) {
    await axios.post(`${MEMORY_SERVER_URL}/affirmations`, data);
  }

  static async getFollower(did: string): Promise<any> {
    const res = await axios.get(`${MEMORY_SERVER_URL}/followers/${did}`);
    return res.data;
  }

  static async getFollowersByColumn(column: string, value: any): Promise<any[]> {
    const res = await axios.get(`${MEMORY_SERVER_URL}/followers`, {
      params: { column, value }
    });
    return res.data;
  }

  static async updateFollower(did: string, column: string, value: any) {
    await axios.post(`${MEMORY_SERVER_URL}/followers/${did}`, { column, value });
  }

  static async ensureFollower(did: string) {
    await axios.post(`${MEMORY_SERVER_URL}/followers/${did}`, {});
  }

  static async getUnreadReplies(): Promise<string[]> {
    const res = await axios.get(`${MEMORY_SERVER_URL}/replies/unread`);
    return res.data;
  }

  static async markRepliesRead() {
    await axios.post(`${MEMORY_SERVER_URL}/replies/read-all`);
  }

  static async getDailyStats(): Promise<DailyReport> {
    // Need endpoint. memory_server implemented /stats/daily
    const res = await axios.get(`${MEMORY_SERVER_URL}/stats/daily`);
    // Convert to DailyReport format if needed. 
    // Server returns { likes, affirmationCount, uniqueAffirmationUserCount, replies, followers }
    // DailyReport expects diffs?
    // For now, return what server gives, mapping to DailyReport structure as best as possible.
    // Or calculate diffs here if we store 'yesterday' locally?
    // Ideally memory_server returns DailyReport compatible object.
    // But server returns totals/daily counts.
    // We can mock some fields.
    const data = res.data;
    return {
      followers: 0, // Mock
      likes: data.likes,
      reply: data.replies,
      affirmationCount: data.affirmationCount,
      uniqueAffirmationUserCount: data.uniqueAffirmationUserCount,
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
    // We need /stats/total endpoint?
    // Or just mock for now.
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
      const res = await axios.get(`${MEMORY_SERVER_URL}/stats/daily`);
      const { replies } = res.data;
      return (replies || 0) < 300; // Example RPD limit
    } catch (e) {
      return true; // Default to true on error
    }
  }
}
