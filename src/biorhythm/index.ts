import eventsMorningWorkday from "../json/event_evening_workday.json";
import eventsMorningDayoff from "../json/event_morning_dayoff.json";
import eventsNoonWorkday from "../json/event_noon_workday.json";
import eventsNoonDayoff from "../json/event_noon_dayoff.json";
import eventsEveningWorkday from "../json/event_evening_workday.json";
import eventsEveningDayoff from "../json/event_evening_dayoff.json";
import eventsNight from "../json/event_night.json";
import eventsMidnight from "../json/event_midnight.json";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from '../config';
import { gemini } from '../gemini';
import { DailyStats } from '../logger';
import { doGoodNightPost, doWhimsicalPost } from "../modes/whimsical";
import EventEmitter from "events";
import { startServer } from "../server";
import { dbPosts } from "../db";
import { logger } from "..";
import { generateImage } from '../gemini/generateImage';
import { getFullDateAndTimeString } from "../gemini/util";
import { question } from "../modes/question";
import { LanguageName } from "../types"; // LanguageNameをインポート

type Status = 'WakeUp' | 'Study' | 'FreeTime' | 'Relax' | 'Sleep';

// WebSocket用にlangプロパティを配列に変換したDailyStatsの型を定義
interface DailyStatsForWebSocket extends Omit<DailyStats, 'lang'> {
  lang: [LanguageName, number][];
}

interface BotStat {
  energy: number;
  mood: string;
  status: string;
  dailyStats: DailyStatsForWebSocket; // 型をDailyStatsForWebSocketに変更
}

const ENERGY_MAXIMUM = 10000;
const SCHEDULE_STEP_MIN = 60;
const SCHEDULE_STEP_MAX = 90;

export class BiorhythmManager extends EventEmitter {
  private status: Status = 'Sleep';
  private statusPrev: Status = 'Sleep';
  private energy: number = 5000;
  private energyPrev: number = 5000;
  private timePrev: string = '';
  private moodPrev: string = "";
  private _generatedImage: Buffer | null = null;
  private firstStepDone = false;

  constructor() {
    super();
    logger.on("statsChange", () => {
      this.emit("statsChange", this.getCurrentState());
    });
  }

  async init() {
    await logger.loadLogFromFile();
    const state = logger.getBiorhythmState();
    if (state.energy !== 5000) {
      this.energy = state.energy;
    }
    if (state.mood !== "") {
      this.moodPrev = state.mood;
    }
    if (state.status !== "Sleep") {
      this.status = state.status as Status;
    }
    await this.updateTopPostUri();
    setInterval(() => this.updateTopPostUri(), 10 * 60 * 1000);
  }

  // --------
  // メソッド
  // --------
  addLike() {
    this.changeEnergy(10);
  }

  addAffirmation(did: string) {
    this.emit('statsChange', this.getCurrentState());
  }

  addFortune() {
    this.changeEnergy(100);
  }

  addCheer() {
    this.changeEnergy(100);
  }

  addAnalysis() {
    this.changeEnergy(100);
  }

  addDJ() {
    this.changeEnergy(50);
  }

  addConversation() {
    this.changeEnergy(50);
  }

  addAnniversary() {
    this.changeEnergy(10);
  }

  addAnswer() {
    this.changeEnergy(100);
  }

  addFollower() {
    this.changeEnergy(200);
  }

  get getEnergy(): number { return this.energy / 100; }
  get getMood(): string { return this.moodPrev; }

  get generatedImage(): Buffer | null {
    return this._generatedImage;
  }

  async updateTopPostUri() {
    const row = await dbPosts.getHighestScore();
    if (row) {
      logger.updateTopPost(row.uri, row.comment);
      this.emit('statsChange', this.getCurrentState());
    }
  }

  getCurrentState(): BotStat {
    const dailyStats = logger.getDailyStats();
    return {
      energy: this.getEnergy,
      mood: this.getMood,
      status: this.status,
      dailyStats: {
        ...dailyStats,
        lang: Array.from(dailyStats.lang.entries()), // Convert Map to array for WebSocket
      },
    };
  }

  // --------
  // メインループ
  // --------
  async step() {
    this.statusPrev = this.status;
    this.energyPrev = this.energy;
    this.timePrev = new Date().toISOString();

    const now = new Date();
    const hour = now.getHours();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;

    const newStatus = this.getNextStatus(hour, isWeekend);

    // 状態変更（20%の確率で維持）
    if (Math.random() >= 0.2) {
      this.status = newStatus;
    }

    // LLMプロンプトを生成
    const prompt = this.buildPrompt(getFullDateAndTimeString(), isWeekend);

    // RPDチェック: 超過時は全処理スキップし、丸1日後に再実行
    if (!(logger.checkRPD())) {
      console.log(`[INFO][BIORHYTHM] RPD exceeded, skipping step.`);
      setTimeout(() => this.step(), 24 * 60 * 60 * 1000); // 24時間後に再実行
      return;
    }

    try {
      const newOutput = await this.generateStatus(prompt); // LLM出力取得
      await this.setOutput(newOutput);

      // おやすみポスト
      if (this.firstStepDone) {
        if (this.status !== this.statusPrev && this.status === "Sleep") {
          console.log(`[INFO][BIORHYTHM] post goodnight!`);
          await doGoodNightPost(this.getMood);
        }
      }
      
      // おはようポスト
      if (this.firstStepDone) {
        if (this.status !== this.statusPrev && this.status === "WakeUp") {
          console.log(`[INFO][BIORHYTHM] post goodmorning!`);
          await question.postQuestion();
          this.energy -= 6000;
        }
      }
      this.firstStepDone = true;

      // 定期つぶやきポスト
      if (((this.getEnergy >= 60) && (this.status !== "Sleep")) || process.env.NODE_ENV === "development") {
        const probability = Math.random() * 100;
        if (probability < this.getEnergy || process.env.NODE_ENV === "development") {
          console.log(`[INFO][BIORHYTHM] post and decrease energy!`);
          await doWhimsicalPost();
          this.energy -= 6000;
        }
      }
    } catch (e) {
      // エラー時はスキップする
      console.error(e);
    }

    // エネルギー変動処理
    this.handleEnergyByStatus();

    // ログ出力
    console.log(`[INFO][BIORHYTHM] status: ${this.status}, energy: ${this.getEnergy}, action: ${this.getMood}`);
    
    // 次回スケジュール（5〜60分）
    const nextInterval = Math.floor(Math.random() * (SCHEDULE_STEP_MAX - SCHEDULE_STEP_MIN + 1) + SCHEDULE_STEP_MIN) * 60 * 1000 ;

    if (!this.firstStepDone) {
      // 起動時にサーバスタートが画像生成より先だと404が返るため、
      // 初回実行時のみPromiseを返し、step完了を待てるようにする
      return new Promise(resolve => {
        setTimeout(() => {
          this.step().then(resolve);
        }, nextInterval);
      });
    } else {
      setTimeout(() => this.step(), nextInterval);
    }
  }

  private getNextStatus(hour: number, isWeekend: boolean): Status {
    if (hour >= 6 && hour < 9) return 'WakeUp';
    if (hour >= 9 && hour < 17) return isWeekend ? 'FreeTime' : 'Study';
    if (hour >= 17 && hour < 19) return 'FreeTime';
    if (hour >= 19 && hour < 22) return 'Relax';
    return 'Sleep';
  }

  private buildPrompt(timeNow: string, isWeekend: Boolean): string {
    return `
以下のキャラクターの行動を描写してほしいです。
${SYSTEM_INSTRUCTION}
このキャラクターが現在どんな気分でなにをしているか、前回の行動ももとにして、具体的に考えてください。
結果は「全肯定たんは～しています」という、AIに入力する平易なプロンプト文で出力してください。
結果は200文字以内に収めてください。
'WakeUp'のステータスの時、このキャラクターの起床時間です。以下を参考に、朝の支度から外出までの出来事を設定してください。
${isWeekend ? `${eventsMorningDayoff}` : `${eventsMorningWorkday}`}
'Study'のステータスの時、このキャラクターは学校で勉強しています。以下を参考に、学校での出来事を設定してください。
${isWeekend ? `${eventsNoonDayoff}` : `${eventsNoonWorkday}`}
'FreeTime'のステータスの時、このキャラクターは余暇を楽しんでいます。以下を参考に、街中や家での遊びを設定してください。
${isWeekend ? `${eventsEveningDayoff}` : `${eventsEveningWorkday}`}
'Relax'のステータスの時、このキャラクターはくつろいでいます。以下を参考に、テレビや読書などのリラックスできる出来事を設定してください。
${eventsNight}
'Sleep'のステータスの時、このキャラクターは就寝中です。行動はしなくてよいです。以下を参考に、夢を見ているならその内容を設定してください。
${eventsMidnight}
-----以下がキャラクターの状態-----
・現在
現在時刻：${timeNow}
ステータス：${this.status}
体力気力（0～100）：${this.getEnergy}
・前回
前回時刻：${this.timePrev}
ステータス：${this.statusPrev}
体力気力（0～100）：${this.energyPrev / 100}
前回した行動：${this.moodPrev}
`;
  }

  private async generateStatus(prompt: string): Promise<string> {
    const response = await gemini.models.generateContent({
      model: MODEL_GEMINI,
      contents: prompt,
    });
    return response.text || "";
  }

  private changeEnergy(amount: number) {
    const newEnergy = Math.min(this.energy + amount, ENERGY_MAXIMUM);
    if (newEnergy !== this.energy) {
      this.energy = newEnergy;
      this.emit('statsChange', this.getCurrentState());
      logger.updateBiorhythmState(this.energy, this.moodPrev, this.status);
    }
  }

  private async setOutput(newOutput: string) {
    if (newOutput !== this.moodPrev) {
      this.moodPrev = newOutput;
      this.emit('statsChange', this.getCurrentState());
      logger.updateBiorhythmState(this.energy, this.moodPrev, this.status);

      // Generate image and store it
      // try {
      //   // Assuming generateImage takes a string and returns a Buffer
      //   this._generatedImage = await generateImage(newOutput);
      // } catch (error) {
      //   console.error("Error generating image:", error);
      //   this._generatedImage = null; // Clear image on error
      // }
    }
  }

  private handleEnergyByStatus() {
    if (this.status !== this.statusPrev) {
      // 遷移した場合だけ処理
      if (this.status === 'Sleep') {
        this.energy = Math.max(this.energy - 2000, 0);
      }
    }

    // 状態にかかわらず、現在の行動によるランダム変動（継続状態でも発生）
    // if (this.status === 'Study') {
    //   this.energy += Math.floor(Math.random() * 1100) - 500; // -500 ~ +500
    // } else if (this.status === 'FreeTime') {
    //   this.energy += Math.floor(Math.random() * 900) + 200; // +200 ~ +1000
    // }

    // 範囲を保証
    const newEnergy = Math.max(0, Math.min(ENERGY_MAXIMUM, this.energy));
    if (newEnergy !== this.energy) {
      this.energy = newEnergy;
      logger.updateBiorhythmState(this.energy, this.moodPrev, this.status);
    }
  }
}
