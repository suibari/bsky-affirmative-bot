import { getSubscribersFromSheet } from "../gsheet/index.js";
import fs from "fs/promises";
import path from "path";

const REQUEST_PER_DAY_GEMINI = 100;
const LOG_FILE_PATH = path.join(process.cwd(), "log.json");

export interface DailyStats {
  followers: number;
  likes: number;
  affirmationCount: number; // 全肯定した回数
  uniqueAffirmations: string[]; // 全肯定したユニークユーザー数
  conversation: number;
  fortune: number;
  cheer: number;
  analysis: number;
  dj: number;
  topPost: string;
  botComment: string;
  rpd: number;
  lastInitializedDate?: Date;
}

interface BiorhythmState {
  energy: number;
  mood: string;
}

class Logger {
  private count: number;
  private lastResetDay: number;
  private dailyStats: DailyStats;
  private biorhythmState: BiorhythmState;

  constructor() {
    this.count = 0;
    this.lastResetDay = new Date().getDate();
    this.dailyStats = {
      followers: 0,
      likes: 0,
      affirmationCount: 0,
      uniqueAffirmations: [],
      conversation: 0,
      fortune: 0,
      cheer: 0,
      analysis: 0,
      dj: 0,
      rpd: 0, // Initialized rpd here
      topPost: "",
      botComment: "",
    };
    this.biorhythmState = {
      energy: 5000, // Initial value from BiorhythmManager
      mood: "",
    };
    this.loadLogFromFile();
  }

  private async loadLogFromFile() {
    try {
      const data = await fs.readFile(LOG_FILE_PATH, "utf-8");
      const parsedData = JSON.parse(data);

      // Initialize with defaults
      const defaultDailyStats: DailyStats = {
        followers: 0,
        likes: 0,
        affirmationCount: 0,
        uniqueAffirmations: [],
        conversation: 0,
        fortune: 0,
        cheer: 0,
        analysis: 0,
        dj: 0,
        rpd: 0, // Default rpd
        topPost: "",
        botComment: "",
        lastInitializedDate: undefined,
      };
      const defaultBiorhythmState = { energy: 5000, mood: "" };

      // Load or use defaults for the main objects
      this.dailyStats = { ...defaultDailyStats, ...(parsedData.dailyStats || {}) };
      this.biorhythmState = { ...defaultBiorhythmState, ...(parsedData.biorhythmState || {}) };
      this.lastResetDay = parsedData.lastResetDay || new Date().getDate();

      // Handle lastInitializedDate
      if (parsedData.dailyStats?.lastInitializedDate) {
        this.dailyStats.lastInitializedDate = new Date(parsedData.dailyStats.lastInitializedDate);
      }

      console.log("[INFO] Log data loaded successfully.");
    } catch (error: any) {
      if (error.code === "ENOENT") {
        console.log("[INFO] Log file not found. Initializing with default values.");
      } else {
        console.error("[ERROR] Failed to load log data:", error);
      }
    }
  }

  async saveLogToFile() {
    try {
      const dataToSave = {
        dailyStats: {
          ...this.dailyStats,
          lastInitializedDate: this.dailyStats.lastInitializedDate?.toISOString(),
        },
        biorhythmState: this.biorhythmState,
        lastResetDay: this.lastResetDay,
      };
      await fs.writeFile(LOG_FILE_PATH, JSON.stringify(dataToSave, null, 2));
      console.log("[INFO] Log data saved successfully.");
    } catch (error) {
      console.error("[ERROR] Failed to save log data:", error);
    }
  }

  init() {
    this.count = 0;
    this.lastResetDay = new Date().getDate();
    this.dailyStats = {
      followers: 0,
      likes: 0,
      affirmationCount: 0,
      uniqueAffirmations: [],
      conversation: 0,
      fortune: 0,
      cheer: 0,
      analysis: 0,
      dj: 0,
      rpd: 0,
      topPost: "",
      botComment: "",
      lastInitializedDate: new Date(),
    };
    this.saveLogToFile();
  }

  addRPD() {
    this.resetIfNeeded();
    this.dailyStats.rpd++;
    this.saveLogToFile();
  }

  async checkRPD() {
    this.resetIfNeeded();
    const subscribers = await getSubscribersFromSheet();
    const result = this.dailyStats.rpd < REQUEST_PER_DAY_GEMINI * subscribers.length; // Changed from this.rpd
    this.count++;

    if (!result) {
      console.warn(
        `[WARN] RPD exceeded: ${this.dailyStats.rpd} / ${REQUEST_PER_DAY_GEMINI * subscribers.length}`
      );
    }

    return result;
  }

  resetIfNeeded() {
    const currentDay = new Date().getDate();
    if (currentDay !== this.lastResetDay) {
      this.init();
    }
  }

  addLike() {
    this.dailyStats.likes++;
    this.saveLogToFile();
  }

  addAffirmation(did: string) {
    this.dailyStats.affirmationCount++; // Increment total count
    if (!this.dailyStats.uniqueAffirmations.includes(did)) {
      this.dailyStats.uniqueAffirmations.push(did);
    }
    this.saveLogToFile();
  }

  addFortune() {
    this.dailyStats.fortune++;
    this.saveLogToFile();
  }

  addCheer() {
    this.dailyStats.cheer++;
    this.saveLogToFile();
  }

  addAnalysis() {
    this.dailyStats.analysis++;
    this.saveLogToFile();
  }

  addDJ() {
    this.dailyStats.dj++;
    this.saveLogToFile();
  }

  addConversation() {
    this.dailyStats.conversation++;
    this.saveLogToFile();
  }

  addFollower() {
    this.dailyStats.followers++;
    this.saveLogToFile();
  }

  updateTopPost(uri: string, comment: string) {
    this.dailyStats.topPost = uri;
    this.dailyStats.botComment = comment;
    this.saveLogToFile();
  }

  getDailyStats() {
    return {
      ...this.dailyStats,
      affirmationCount: this.dailyStats.affirmationCount, // Total count
      uniqueAffirmationUserCount: this.dailyStats.uniqueAffirmations.length, // Number of unique users
    };
  }

  updateBiorhythmState(energy: number, mood: string) {
    this.biorhythmState.energy = energy;
    this.biorhythmState.mood = mood;
    this.saveLogToFile();
  }

  getBiorhythmState() {
    return this.biorhythmState;
  }
}

export const logger = new Logger();
