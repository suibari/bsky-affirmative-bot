import { MemoryService } from "@bsky-affirmative-bot/clients";

/**
 * Mock implementation of DB adapter.
 * Actual DB operations are handled by MemoryService or external services.
 * This class serves as a placeholder for compatibility with existing code structure.
 */
export class SQLite3 {
  async selectRows(columns: string[], filter?: any): Promise<any[]> {
    // Basic proxy for replies, can be expanded
    return await MemoryService.getUnreadReplies();
  }

  async selectDb(id: string, column: string): Promise<any> {
    return 0; // Mock
  }

  async insertDb(id: string) {
    // Mock
  }

  async updateDb(id: string, column: string, value: any) {
    // Mock
  }

  async insertOrUpdateDb(id: string) {
    // Mock
  }

  async deleteRow(id: string) {
    // Mock
  }

  async getHighestScore() {
    return await MemoryService.getHighestScorePosts();
  }

  async getRowById(id: string) {
    return {
      created_at: new Date().toISOString(),
      is_u18: 0,
      is_ai_only: 0,
      reply_freq: "100",
      last_uranai_at: new Date().toISOString(),
      conv_history: "[]",
      last_analyze_at: new Date().toISOString(),
      last_cheer_at: new Date().toISOString(),
      user_anniv_name: "",
      user_anniv_date: ""
    } as any;
  }

  async insertRow(data: any) {
    // Mock
  }
}

export const dbReplies = new SQLite3();
export const dbPosts = new SQLite3();
export const dbLikes = new SQLite3();
export const db = dbPosts; // Alias
