import eventsMorningWorkday from "@bsky-affirmative-bot/shared-configs/json/event_evening_workday.json" with { type: "json" };
import eventsMorningDayoff from "@bsky-affirmative-bot/shared-configs/json/event_morning_dayoff.json" with { type: "json" };
import eventsNoonWorkday from "@bsky-affirmative-bot/shared-configs/json/event_noon_workday.json" with { type: "json" };
import eventsNoonDayoff from "@bsky-affirmative-bot/shared-configs/json/event_noon_dayoff.json" with { type: "json" };
import eventsEveningWorkday from "@bsky-affirmative-bot/shared-configs/json/event_evening_workday.json" with { type: "json" };
import eventsEveningDayoff from "@bsky-affirmative-bot/shared-configs/json/event_evening_dayoff.json" with { type: "json" };
import eventsNight from "@bsky-affirmative-bot/shared-configs/json/event_night.json" with { type: "json" };
import eventsMidnight from "@bsky-affirmative-bot/shared-configs/json/event_midnight.json" with { type: "json" };
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from '@bsky-affirmative-bot/shared-configs';
import { gemini, generateContentWithRetry } from '@bsky-affirmative-bot/bot-brain';
import { DailyReport, Stats } from '@bsky-affirmative-bot/shared-configs';
// import { doGoodNightPost, doWhimsicalPost, doQuestionPost } from "./features/whimsical.js"; // Removed
import EventEmitter from "events";
import { MemoryService, BskyService } from "@bsky-affirmative-bot/clients";
import { getFullDateAndTimeString } from "@bsky-affirmative-bot/shared-configs";
import { LanguageName } from "@bsky-affirmative-bot/shared-configs";

import { UtilityAI } from "./utilityAI.js";
import { getYokohamaWeather } from "@bsky-affirmative-bot/bot-brain";
import { Type } from "@google/genai";

import { Status } from "@bsky-affirmative-bot/shared-configs";

// WebSocket用にlangプロパティを配列に変換したDailyStatsの型を定義
interface DailyStatsForWebSocket extends Omit<DailyReport, 'lang'> { // DailyStatsをDailyReportに変更
  lang: [LanguageName, number][];
}

interface BotStat {
  energy: number;
  mood: string;
  status: string;
  dailyStats: DailyStatsForWebSocket; // 型をDailyStatsForWebSocketに変更
  totalStats: Stats; // 追加: totalStatsプロパティ
  utilities: Record<Status, number>;
  nextStepTime: string;
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
  private nextStepTime: string = "";
  private _generatedImage: Buffer | null = null;
  private firstStepDone = false;
  private lastGoodNightPostDate?: string;
  private lastGoodMorningPostDate?: string;

  constructor() {
    super();
    // logger.on("statsChange", () => { ... }); 
    // We don't have local logger emitting events anymore. 
    // We should emit our own changes when we update state.
  }

  async init() {
    // await logger.loadLogFromFile();
    const state = await MemoryService.getBiorhythmState();
    if (state.energy !== undefined) {
      this.energy = state.energy;
    } else {
      this.energy = 5000;
    }
    if (state.mood !== undefined) {
      this.moodPrev = state.mood;
    }
    if (state.status !== undefined) {
      this.status = state.status as Status;
    } else {
      this.status = "Sleep";
    }
    this.lastGoodNightPostDate = state.lastGoodNightPostDate;
    this.lastGoodMorningPostDate = state.lastGoodMorningPostDate;
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
    this.getCurrentState().then(state => this.emit('statsChange', state));
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
    const rows = await MemoryService.getHighestScorePosts();
    if (rows && rows.length > 0) {
      MemoryService.updateTopPost(rows[0].uri, rows[0].comment);
      // this.emit('statsChange', this.getCurrentState()); // getCurrentState is async now? No, but depends on async MemoryService calls.
    }
  }

  async getCurrentState(): Promise<BotStat> {
    const dailyStats = await MemoryService.getDailyStats();
    const totalStats = await MemoryService.getTotalStats();

    const now = new Date();
    const hour = now.getHours();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;

    // Convert lang Map to array safely
    const langArray: [LanguageName, number][] = dailyStats.lang instanceof Map
      ? Array.from(dailyStats.lang.entries())
      : [];

    return {
      energy: this.getEnergy,
      mood: this.getMood,
      status: this.status,
      dailyStats: {
        ...dailyStats,
        lang: langArray,
      },
      totalStats: {
        ...totalStats,
      },
      utilities: UtilityAI.getUtilities({
        hour,
        isWeekend,
        energy: this.getEnergy,
        currentAction: this.moodPrev
      }),
      nextStepTime: this.nextStepTime,
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

    // 未読のリプライ取得
    const unreadReply = await MemoryService.getUnreadReplies();

    // 新しいステータス候補を決定
    this.status = UtilityAI.selectAction({
      hour,
      isWeekend,
      energy: this.getEnergy,
      currentAction: this.moodPrev
    });

    // 天候取得
    const weather = await getYokohamaWeather();

    // LLMプロンプトを生成
    const prompt = this.buildPrompt(getFullDateAndTimeString(), isWeekend, weather, unreadReply, UtilityAI.getUtilities({
      hour,
      isWeekend,
      energy: this.getEnergy,
      currentAction: this.moodPrev
    }));

    // RPDチェック: 超過時は全処理スキップし、丸1日後に再実行
    if (!(await MemoryService.checkRPD())) {
      console.log(`[INFO][BIORHYTHM] RPD exceeded, skipping step.`);
      const nextInterval = 24 * 60 * 60 * 1000;
      this.nextStepTime = new Date(Date.now() + nextInterval).toISOString();
      this.emit('statsChange', await this.getCurrentState());
      setTimeout(() => this.step(), nextInterval); // 24時間後に再実行
      return;
    }

    let duration_minutes = 60;
    let nextInterval = 60 * 60 * 1000;

    try {
      const result = await this.generateStatus(prompt); // LLM出力取得
      const status_text = result.status_text;
      duration_minutes = result.duration_minutes;

      // 次回スケジュール（AIが決めた時間、ただし最小5分、最大180分とする）
      const duration = Math.max(5, Math.min(duration_minutes, 180));
      nextInterval = process.env.NODE_ENV === "development" ? 5 * 60 * 1000 :
        duration * 60 * 1000;
      this.nextStepTime = new Date(Date.now() + nextInterval).toISOString();

      await this.setOutput(status_text);

      // おやすみポスト
      if (this.firstStepDone) {
        if (this.status !== this.statusPrev && this.status === "Sleep" && (hour >= 21 || hour <= 3)) {
          if (this.canPostGoodNight()) {
            console.log(`[INFO][BIORHYTHM] post goodnight!`);
            await BskyService.postGoodNight(this.getMood);
            this.setGoodNightPostDate();
          } else {
            console.log(`[INFO][BIORHYTHM] goodnight post already done today, skipping`);
          }
        }
      }

      // おはようポスト
      if (this.firstStepDone) {
        if (this.status !== this.statusPrev && this.status === "WakeUp" && (hour >= 4 || hour <= 10)) {
          if (this.canPostGoodMorning()) {
            console.log(`[INFO][BIORHYTHM] post goodmorning!`);
            await BskyService.postQuestion();
            this.changeEnergy(-6000);
            this.setGoodMorningPostDate();
          } else {
            console.log(`[INFO][BIORHYTHM] goodmorning post already done today, skipping`);
          }
        }
      }
      this.firstStepDone = true;

      // 定期つぶやきポスト
      if (((this.getEnergy >= 60) && (this.status !== "Sleep") || process.env.NODE_ENV === "development")) {
        const probability = Math.random() * 100;
        if (probability < this.getEnergy || process.env.NODE_ENV === "development") {
          console.log(`[INFO][BIORHYTHM] post and decrease energy!`);
          await BskyService.postWhimsical(this.getMood);
          this.changeEnergy(-6000);
        }
      }

      this.getCurrentState().then(state => this.emit('statsChange', state));
    } catch (e) {
      // エラー時はスキップする
      console.error(e);
    }

    // エネルギー変動処理: Energyは完全にユーザインタラクトベースとするのでコメントアウト
    // this.handleEnergyByStatus();

    // ログ出力
    console.log(`[INFO][BIORHYTHM] status: ${this.status}, energy: ${this.getEnergy}, action: ${this.getMood}, next: ${duration_minutes} min`);

    // リプライ既読処理
    await MemoryService.markRepliesRead();

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

  private buildPrompt(timeNow: string, isWeekend: Boolean, weather: string, unreadReply?: string[], utilities?: Record<Status, number>): string {
    return `
以下のキャラクターの行動を描写してほしいです。
${SYSTEM_INSTRUCTION}
このキャラクターが現在どんな気分でなにをしているか、現在時刻・天候・ステータス・行動欲求・前回した行動をもとにして、具体的に考えてください。
* ルール
- 結果はJSON形式で出力してください。
- "status_text": 「全肯定たんは～しています」という、AIに入力する平易なプロンプト文（200文字以内）。
- "duration_minutes": その行動にかかる時間（分）。行動の内容に合わせて5分から90分の範囲内で適切に決めてください。
- ステータスについて、WakeUpは起床時、Studyは勉強中、FreeTimeは余暇時間、Relaxは休憩中、Sleepは就寝中(夢の中)を意味します。
- 行動欲求は、あなたがどの行動をしたいか、です。たとえばSleepが一番高いのに、ステータスがFreeTimeの場合、眠いのに遊んでいる状態です。
- 以下の日にはその日にふさわしい行動をさせること
  * 元旦 (1月1日)
  * 節分 (2月3日)
  * バレンタイン (2月14日)
  * ホワイトデー (3月14日)
  * エイプリルフール (4月1日)
  * 母の日
  * 父の日
  * 七夕 (7月7日)
  * ハロウィン (10月31日)
  * クリスマス (12月25日)
  * 大晦日 (12月31日)
-----行動参考例-----
* 以下がキャラクターの行動例です。
${this.status === "WakeUp" ? isWeekend ? `${JSON.stringify(eventsMorningDayoff)}` : `${JSON.stringify(eventsMorningWorkday)}` :
        this.status === "Study" ? isWeekend ? `${JSON.stringify(eventsNoonDayoff)}` : `${JSON.stringify(eventsNoonWorkday)}` :
          this.status === "FreeTime" ? isWeekend ? `${JSON.stringify(eventsEveningDayoff)}` : `${JSON.stringify(eventsEveningWorkday)}` :
            this.status === "Relax" ? `${JSON.stringify(eventsNight)}` :
              this.status === "Sleep" ? `${JSON.stringify(eventsMidnight)}` : ""
      }
* 以下がユーザーからもらったコメントです。次の行動を考える際に参考にすること。
${JSON.stringify(unreadReply)}
-----以下がキャラクターの状態-----
・現在
現在時刻：${timeNow}
天候：${weather}
ステータス：${this.status}
体力気力（0～100）：${this.getEnergy}
行動欲求：${JSON.stringify(utilities)}
・前回
前回時刻：${this.timePrev}
ステータス：${this.statusPrev}
体力気力（0～100）：${this.energyPrev / 100}
前回した行動：${this.moodPrev}
`;
  }

  private async generateStatus(prompt: string): Promise<{ status_text: string, duration_minutes: number }> {
    const response = await generateContentWithRetry({
      model: MODEL_GEMINI,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status_text: { type: Type.STRING },
            duration_minutes: { type: Type.INTEGER },
          },
          required: ["status_text", "duration_minutes"],
        },
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }

    return { status_text: "", duration_minutes: 60 };
  }

  private changeEnergy(amount: number) {
    // 0~100クリップ処理
    const newEnergy = Math.max(Math.min(this.energy + amount, ENERGY_MAXIMUM), 0);

    if (newEnergy !== this.energy) {
      this.energy = newEnergy;
      // this.emit('statsChange', this.getCurrentState()); // getCurrentState is async
      this.getCurrentState().then(state => this.emit('statsChange', state));
      MemoryService.updateBiorhythmState({ energy: this.energy, mood: this.moodPrev, status: this.status });
    }
  }

  private async setOutput(newOutput: string) {
    if (newOutput !== this.moodPrev) {
      this.moodPrev = newOutput;
      this.getCurrentState().then(state => this.emit('statsChange', state));
      MemoryService.updateBiorhythmState({ energy: this.energy, mood: this.moodPrev, status: this.status });

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
    // if (this.status !== this.statusPrev) {
    //   // 遷移した場合だけ処理
    //   if (this.status === 'Sleep') {
    //     this.energy = Math.max(this.energy - 2000, 0);
    //   }
    // }

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
      MemoryService.updateBiorhythmState({ energy: this.energy, mood: this.moodPrev, status: this.status });
    }
  }

  private getAdjustedDateString(): string {
    const now = new Date();
    // 0~4時は前日扱いとする
    if (now.getHours() <= 4) {
      now.setDate(now.getDate() - 1);
    }
    // YYYY-MM-DD形式
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private canPostGoodNight(): boolean {
    const today = this.getAdjustedDateString();
    return this.lastGoodNightPostDate !== today;
  }

  private setGoodNightPostDate() {
    const today = this.getAdjustedDateString();
    this.lastGoodNightPostDate = today;
    MemoryService.updateBiorhythmState({ lastGoodNightPostDate: today });
  }

  private canPostGoodMorning(): boolean {
    const today = this.getAdjustedDateString();
    return this.lastGoodMorningPostDate !== today;
  }

  private setGoodMorningPostDate() {
    const today = this.getAdjustedDateString();
    this.lastGoodMorningPostDate = today;
    MemoryService.updateBiorhythmState({ lastGoodMorningPostDate: today });
  }
}
