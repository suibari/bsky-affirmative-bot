import { GoogleGenAI } from "@google/genai";
import { EXEC_PER_COUNTS } from '../config/index.js';
const REQUEST_PER_DAY_GEMINI = 200;

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

  checkMod() {
    this.resetIfNeeded(); // 日付が変わっていれば初期化
    const result = (this.count % EXEC_PER_COUNTS === 0) && (this.rpd < REQUEST_PER_DAY_GEMINI);
    this.count++;

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
