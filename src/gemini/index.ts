import { GoogleGenAI } from "@google/genai";
import { EXEC_PER_COUNTS } from '../config/index.js';
import { getSubscribersFromSheet } from "../gsheet/index.js";
const REQUEST_PER_DAY_GEMINI = 100;

// Geminiのインスタンスを作成
export const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

class RequestPerDayGemini {
  rpd: number;
  count: number;
  lastResetDay: number;

  constructor() {
    this.rpd = 0;
    this.count = 0;
    this.lastResetDay = new Date().getDate(); // 最後に初期化した日を記録
  }

  init() {
    this.rpd = 0;
    this.count = 0;
    this.lastResetDay = new Date().getDate(); // 初期化したタイミングの日付
  }

  add() {
    this.resetIfNeeded(); // 日付が変わっていれば初期化
    if (this.rpd < REQUEST_PER_DAY_GEMINI) {
      this.rpd++;
    }
  }

  async checkRPD() {
    this.resetIfNeeded(); // 日付が変わっていれば初期化
    const subscribers = await getSubscribersFromSheet();
    const result = (this.rpd < REQUEST_PER_DAY_GEMINI * subscribers.length); // RPDがサブスク数*100以下かチェック
    this.count++;

    if (!result) {
      console.warn(`[WARN] RPD exceeded: ${this.rpd} / ${REQUEST_PER_DAY_GEMINI * subscribers.length}`);
    }

    return result;
  }

  resetIfNeeded() {
    const currentDay = new Date().getDate(); // 現在の日
    if (currentDay !== this.lastResetDay) {
      this.init(); // 日付が変わっていたら初期化
    }
  }
}
export const RPD = new RequestPerDayGemini();
