import { getSubscribersFromSheet } from "../gsheet/index.js";
import fs from "fs/promises";
import path from "path";
import EventEmitter from "events";
import { LIMIT_REQUEST_PER_DAY_GEMINI } from "../config/index.js";
import { LanguageName } from "../types.js";

const REQUEST_PER_DAY_GEMINI = 100;
const LOG_FILE_PATH = path.join(process.cwd(), "log.json");

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
  lang: Map<LanguageName, number>;
}

export interface DailyReport extends Stats {
  uniqueAffirmationUserCount: number;
  topPost: string;
  botComment: string;
  bskyrate: number; // daily
  rpd: number; // daily
  lastInitializedDate?: Date;
}

interface BiorhythmState {
  energy: number;
  mood: string;
  status: string;
}

export class Logger extends EventEmitter {
  private count: number;
  private lastResetDay: number;
  private totalStats: Stats;
  private yesterdayStats: Stats; // 前日の総回数
  private dailyBskyRate: number; // その日のbskyrate
  private dailyRPD: number; // その日のrpd
  private dailyTopPost: string;
  private dailyBotComment: string;
  private dailyLastInitializedDate: Date;
  private biorhythmState: BiorhythmState;
  private uniqueAffirmations: string[]; // その日のユニークユーザー
  private uriQuestionRoot?: string;
  private uriWhimsicalPostRoot?: string;
  private themeQuestion?: string;

  constructor() {
    super();
    this.count = 0;
    this.lastResetDay = new Date().getDate();
    this.totalStats = {
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
      lang: new Map<LanguageName, number>(),
    };
    this.yesterdayStats = { // yesterdayStatsの初期化
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
      lang: new Map<LanguageName, number>(),
    };
    this.dailyBskyRate = 0;
    this.dailyRPD = 0;
    this.dailyTopPost = "";
    this.dailyBotComment = "";
    this.dailyLastInitializedDate = new Date();
    this.biorhythmState = {
      energy: 5000, // Initial value from BiorhythmManager
      mood: "",
      status: "Sleep",
    };
    this.uniqueAffirmations = [];
    this.uriQuestionRoot = "";
    this.themeQuestion = "";
    this.uriWhimsicalPostRoot = "";
    this.loadLogFromFile();
    this.scheduleDailyReset();
  }

  async loadLogFromFile() {
    try {
      const data = await fs.readFile(LOG_FILE_PATH, "utf-8");
      const parsedData = JSON.parse(data);

      const defaultStats: Stats = {
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
        lang: new Map<LanguageName, number>(),
      };
      const defaultBiorhythmState = { energy: 5000, mood: "", status: "Sleep" };

      this.totalStats = { ...defaultStats, ...(parsedData.totalStats || {}) };
      if (parsedData.totalStats?.lang) {
        this.totalStats.lang = new Map<LanguageName, number>(parsedData.totalStats.lang);
      }

      this.yesterdayStats = { ...defaultStats, ...(parsedData.yesterdayStats || {}) };
      if (parsedData.yesterdayStats?.lang) {
        this.yesterdayStats.lang = new Map<LanguageName, number>(parsedData.yesterdayStats.lang);
      }

      this.dailyBskyRate = parsedData.dailyBskyRate ?? 0;
      this.dailyRPD = parsedData.dailyRPD ?? 0;
      this.dailyTopPost = parsedData.dailyTopPost || "";
      this.dailyBotComment = parsedData.dailyBotComment || "";
      this.dailyLastInitializedDate = parsedData.dailyLastInitializedDate ? new Date(parsedData.dailyLastInitializedDate) : new Date();

      this.biorhythmState = { ...defaultBiorhythmState, ...(parsedData.biorhythmState || {}) };
      this.uniqueAffirmations = parsedData.uniqueAffirmations || [];
      this.uriQuestionRoot = parsedData.uriQuestionRoot || "";
      this.themeQuestion = parsedData.themeQuestion || "";
      this.uriWhimsicalPostRoot = parsedData.uriWhimsicalPostRoot || "";
      this.lastResetDay = parsedData.lastResetDay || new Date().getDate();

      console.log("[INFO] Log data loaded successfully.");
    } catch (error: any) {
      if (error.code === "ENOENT") {
        console.log("[INFO] Log file not found. Initializing with default values.");
      } else if (error instanceof SyntaxError) {
        console.error("[ERROR] Failed to parse log data: Invalid JSON format.");
      } else {
        console.error("[ERROR] Failed to load log data:", error);
      }
    }
  }

  async saveLogToFile() {
    try {
      const dataToSave = {
        totalStats: {
          followers: this.totalStats.followers,
          likes: this.totalStats.likes,
          affirmationCount: this.totalStats.affirmationCount,
          conversation: this.totalStats.conversation,
          fortune: this.totalStats.fortune,
          cheer: this.totalStats.cheer,
          analysis: this.totalStats.analysis,
          dj: this.totalStats.dj,
          anniversary: this.totalStats.anniversary,
          answer: this.totalStats.answer,
          lang: Array.from(this.totalStats.lang.entries()),
        },
        yesterdayStats: {
          followers: this.yesterdayStats.followers,
          likes: this.yesterdayStats.likes,
          affirmationCount: this.yesterdayStats.affirmationCount,
          conversation: this.yesterdayStats.conversation,
          fortune: this.yesterdayStats.fortune,
          cheer: this.yesterdayStats.cheer,
          analysis: this.yesterdayStats.analysis,
          dj: this.yesterdayStats.dj,
          anniversary: this.yesterdayStats.anniversary,
          answer: this.yesterdayStats.answer,
          lang: Array.from(this.yesterdayStats.lang.entries()),
        },
        dailyBskyRate: this.dailyBskyRate,
        dailyRPD: this.dailyRPD,
        dailyTopPost: this.dailyTopPost,
        dailyBotComment: this.dailyBotComment,
        dailyLastInitializedDate: this.dailyLastInitializedDate,
        biorhythmState: this.biorhythmState,
        uniqueAffirmations: this.uniqueAffirmations,
        uriQuestionRoot: this.uriQuestionRoot,
        uriWhimsicalPostRoot: this.uriWhimsicalPostRoot,
        themeQuestion: this.themeQuestion,
        lastResetDay: this.lastResetDay,
      };
      await fs.writeFile(LOG_FILE_PATH, JSON.stringify(dataToSave, null, 2));
      // console.log("[INFO] Log data saved successfully.");
    } catch (error) {
      console.error("[ERROR] Failed to save log data:", error);
    }
  }

  init() {
    this.count = 0;
    this.lastResetDay = new Date().getDate();

    // 前日の統計をtotalStatsで更新
    this.yesterdayStats = {
      followers: this.totalStats.followers,
      likes: this.totalStats.likes,
      reply: this.totalStats.reply,
      affirmationCount: this.totalStats.affirmationCount,
      conversation: this.totalStats.conversation,
      fortune: this.totalStats.fortune,
      cheer: this.totalStats.cheer,
      analysis: this.totalStats.analysis,
      dj: this.totalStats.dj,
      anniversary: this.totalStats.anniversary,
      answer: this.totalStats.answer,
      lang: new Map<LanguageName, number>(this.totalStats.lang),
    };

    this.uniqueAffirmations = []; // その日のユニークユーザーをリセット
    this.dailyBskyRate = 0; // 日ごとのbskyrateをリセット
    this.dailyRPD = 0; // 日ごとのrpdをリセット
    this.dailyTopPost = ""; // 日ごとのトップポストをリセット
    this.dailyBotComment = ""; // 日ごとのボットコメントをリセット
    this.dailyLastInitializedDate = new Date(); // 日ごとの初期化日付を更新

    // totalStats はリセットしない
    this.saveLogToFile();
    this.emit("statsChange");
  }

  addBskyRate() {
    this.dailyBskyRate += 3;
    this.saveLogToFile();
  }

  addRPD() {
    this.dailyRPD++;
    this.saveLogToFile();
  }

  checkRPD() {
    const result = this.dailyRPD < LIMIT_REQUEST_PER_DAY_GEMINI; // Changed from this.rpd
    this.count++;

    if (!result) {
      console.warn(
        `[WARN] RPD exceeded: ${this.dailyRPD} / ${LIMIT_REQUEST_PER_DAY_GEMINI}`
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
    this.totalStats.likes++; // 総回数のみ更新
    this.saveLogToFile();
    this.emit("statsChange");
  }

  addReply() {
    this.totalStats.reply++;
    this.saveLogToFile();
    this.emit("statsChange");
  }

  addAffirmation(did: string) {
    this.totalStats.affirmationCount++; // 総回数のみ更新
    if (!this.uniqueAffirmations.includes(did)) {
      this.uniqueAffirmations.push(did);
    }
    this.saveLogToFile();
    this.emit("statsChange");
  }

  addFortune() {
    this.totalStats.fortune++; // 総回数のみ更新
    this.saveLogToFile();
    this.emit("statsChange");
  }

  addCheer() {
    this.totalStats.cheer++; // 総回数のみ更新
    this.saveLogToFile();
    this.emit("statsChange");
  }

  addAnalysis() {
    this.totalStats.analysis++; // 総回数のみ更新
    this.saveLogToFile();
    this.emit("statsChange");
  }

  addDJ() {
    this.totalStats.dj++; // 総回数のみ更新
    this.saveLogToFile();
    this.emit("statsChange");
  }

  addConversation() {
    this.totalStats.conversation++; // 総回数のみ更新
    this.saveLogToFile();
    this.emit("statsChange");
  }

  addFollower() {
    this.totalStats.followers++; // 総回数のみ更新
    this.saveLogToFile();
    this.emit("statsChange");
  }

  addAnniversary() {
    this.totalStats.anniversary++; // 総回数のみ更新
    this.saveLogToFile();
    this.emit("statsChange");
  }

  addAnswer() {
    this.totalStats.answer++; // 総回数のみ更新
    this.saveLogToFile();
    this.emit("statsChange");
  }

  updateTopPost(uri: string, comment: string) {
    this.dailyTopPost = uri;
    this.dailyBotComment = comment;
    this.saveLogToFile();
  }

  getDailyStats(): DailyReport {
    const dailyLang = new Map<LanguageName, number>();
    for (const [lang, count] of this.totalStats.lang.entries()) {
      const yesterdayCount = this.yesterdayStats.lang.get(lang) ?? 0;
      dailyLang.set(lang, count - yesterdayCount);
    }

    return {
      followers: this.totalStats.followers - this.yesterdayStats.followers,
      likes: this.totalStats.likes - this.yesterdayStats.likes,
      reply: this.totalStats.reply - this.yesterdayStats.reply,
      affirmationCount: this.totalStats.affirmationCount - this.yesterdayStats.affirmationCount,
      uniqueAffirmationUserCount: this.uniqueAffirmations.length,
      conversation: this.totalStats.conversation - this.yesterdayStats.conversation,
      fortune: this.totalStats.fortune - this.yesterdayStats.fortune,
      cheer: this.totalStats.cheer - this.yesterdayStats.cheer,
      analysis: this.totalStats.analysis - this.yesterdayStats.analysis,
      dj: this.totalStats.dj - this.yesterdayStats.dj,
      anniversary: this.totalStats.anniversary - this.yesterdayStats.anniversary,
      answer: this.totalStats.answer - this.yesterdayStats.answer,
      topPost: this.dailyTopPost,
      botComment: this.dailyBotComment,
      bskyrate: this.dailyBskyRate,
      rpd: this.dailyRPD,
      lang: dailyLang,
      lastInitializedDate: this.dailyLastInitializedDate,
    };
  }

  getTotalStats(): Stats {
    return {
      followers: this.totalStats.followers,
      likes: this.totalStats.likes,
      reply: this.totalStats.reply,
      affirmationCount: this.totalStats.affirmationCount,
      conversation: this.totalStats.conversation,
      fortune: this.totalStats.fortune,
      cheer: this.totalStats.cheer,
      analysis: this.totalStats.analysis,
      dj: this.totalStats.dj,
      anniversary: this.totalStats.anniversary,
      answer: this.totalStats.answer,
      lang: this.totalStats.lang,
    };
  }

  updateBiorhythmState(energy: number, mood: string, status: string) {
    this.biorhythmState.energy = energy;
    this.biorhythmState.mood = mood;
    this.biorhythmState.status = status;
    this.saveLogToFile();
  }

  getBiorhythmState(): BiorhythmState {
    return this.biorhythmState;
  }

  private scheduleDailyReset() {
    const now = new Date();
    const nextReset = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + (now.getHours() >= 3 ? 1 : 0),
      3, 0, 0, 0
    );
    const delay = nextReset.getTime() - now.getTime();

    setTimeout(() => {
      this.init();
      setInterval(() => this.init(), 24 * 60 * 60 * 1000);
    }, delay);
  }

  setQuestionState(uriRoot: string, theme: string) {
    this.uriQuestionRoot = uriRoot;
    this.themeQuestion = theme;
    this.saveLogToFile();
  }

  getQuestionState() {
    return {
      uriQuestionRoot: this.uriQuestionRoot,
      themeQuestion: this.themeQuestion,
    };
  }

  setWhimsicalPostRoot(uriRoot: string) {
    this.uriWhimsicalPostRoot = uriRoot;
    this.saveLogToFile();
  }

  getWhimsicalPostRoot() {
    return this.uriWhimsicalPostRoot;
  }

  addLang(lang: LanguageName) {
    this.totalStats.lang.set(lang, (this.totalStats.lang.get(lang) ?? 0) + 1); // 総回数のみ更新
    this.saveLogToFile();
    this.emit("statsChange");
  }
}
