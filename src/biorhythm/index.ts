import eventsMorningWorkday from "../json/event_evening_workday.json";
import eventsMorningDayoff from "../json/event_evening_dayoff.json";
import eventsNoonWorkday from "../json/event_noon_workday.json";
import eventsNoonDayoff from "../json/event_noon_dayoff.json";
import eventsEveningWorkday from "../json/event_evening_workday.json";
import eventsEveningDayoff from "../json/event_evening_dayoff.json";
import eventsNight from "../json/event_night.json";
import eventsMidnight from "../json/event_midnight.json";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from '../config';
import { gemini } from '../gemini';
import { doWhimsicalPost } from "../modes/whimsical";
import EventEmitter from "events";
import { startServer } from "../server";

type Status = 'WakeUp' | 'Study' | 'FreeTime' | 'Relax' | 'Sleep';
interface BotStat {
  energy: number;
  mood: string;
  dailyStats: {
    followers: number;
    likes: number;
    affirmations: number;
    fortune: number;
    cheer: number;
    analysis: number;
    dj: number;
  }
}

const ENERGY_MAXIMUM = 10000;

export class BiorhythmManager extends EventEmitter {
  private status: Status = 'Sleep';
  private statusPrev: Status = 'Sleep';
  private energy: number = 5000;
  private energyPrev: number = 5000;
  private timePrev: string = '';
  private moodPrev: string = '';
  private dailyStats = {
    followers: 0,
    likes: 0,
    affirmations: new Set<string>(),
    fortune: 0,
    cheer: 0,
    analysis: 0,
    dj: 0,
  }

  constructor() {
    super();
    this.scheduleDailyReset();
  }

  // --------
  // メソッド
  // --------
  addLike() {
    this.dailyStats.likes++;
    this.changeEnergy(10);
    this.emit('statsChange', this.getCurrentState());
  }

  addAffirmation(did: string) {
    const sizeBefore = this.dailyStats.affirmations.size;
    this.dailyStats.affirmations.add(did);
    if (this.dailyStats.affirmations.size !== sizeBefore) {
      this.emit('statsChange', this.getCurrentState());
    }
  }

  addFortune() {
    this.dailyStats.fortune++;
    this.changeEnergy(100);
    this.emit('statsChange', this.getCurrentState());
  }

  addCheer() {
    this.dailyStats.cheer++;
    this.changeEnergy(100);
    this.emit('statsChange', this.getCurrentState());
  }

  addAnalysis() {
    this.dailyStats.analysis++;
    this.changeEnergy(200);
    this.emit('statsChange', this.getCurrentState());
  }

  addDJ() {
    this.dailyStats.dj++;
    this.changeEnergy(50);
    this.emit('statsChange', this.getCurrentState());
  }

  addConversation() {
    this.dailyStats.dj++;
    this.changeEnergy(50);
    this.emit('statsChange', this.getCurrentState());
  }

  addFollower() {
    this.dailyStats.followers++;
    this.changeEnergy(100);
    this.emit('statsChange', this.getCurrentState());
  }

  get getEnergy(): number { return this.energy / 100; }
  get getMood(): string { return this.moodPrev; }

  getCurrentState(): BotStat {
    return {
      energy: this.getEnergy,
      mood: this.getMood,
      dailyStats: {
        followers: this.dailyStats.followers,
        likes: this.dailyStats.likes,
        affirmations: this.dailyStats.affirmations.size, // ← Set → 配列に変換
        fortune: this.dailyStats.fortune,
        cheer: this.dailyStats.cheer,
        analysis: this.dailyStats.analysis,
        dj: this.dailyStats.dj,
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

    // エネルギー変動処理
    this.handleEnergyByStatus();

    // LLMプロンプトを生成
    const prompt = this.buildPrompt(now.toISOString());

    // 開発環境では常にenergyMAX
    if (process.env.NODE_ENV === "development") {
      this.energy = ENERGY_MAXIMUM;
    }

    let isPost: boolean = false;
    try {
      if (((this.getEnergy >= 60) && (newStatus !== "Sleep")) || (process.env.NODE_ENV === "development")) {
        const probability = Math.random() * 100;
        if (probability < this.getEnergy) {
          console.log(`[INFO][BIORHYTHM] post and decrease energy!`)
          const newOutput = await this.generateStatus(prompt); // LLM出力取得
          this.setOutput(newOutput);

          // ポスト処理をここに追加（Geminiなど）
          await doWhimsicalPost();
          this.energy -= 6000;
          isPost = true;
        }
      }

      // ポスト条件を満たさなかった or ポストしなかった場合は、通常通り LLM 呼び出し（例：状態更新用）
      if (!isPost) {
        const newOutput = await this.generateStatus(prompt); // LLM出力取得
        this.setOutput(newOutput);
      }
    } catch (e) {
      // エラー時はスキップする
      console.error(e);
    }

    // ログ出力
    console.log(`[INFO][BIORHYTHM] status: ${this.status}, energy: ${this.getEnergy}, action: ${this.getMood}`);
    
    // 次回スケジュール（5〜60分、開発環境では1分ごと）
    const nextInterval = process.env.NODE_ENV === "development" ? 60 * 1000 : Math.floor(Math.random() * (60 - 5 + 1) + 5) * 60 * 1000;
    setTimeout(() => this.step(), nextInterval);
  }

  private getNextStatus(hour: number, isWeekend: boolean): Status {
    if (hour >= 6 && hour < 9) return 'WakeUp';
    if (hour >= 9 && hour < 17) return isWeekend ? 'FreeTime' : 'Study';
    if (hour >= 17 && hour < 19) return 'FreeTime';
    if (hour >= 19 && hour < 23) return 'Relax';
    return 'Sleep';
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
    this.energy = Math.max(0, Math.min(ENERGY_MAXIMUM, this.energy));
  }

  private buildPrompt(timeNow: string): string {
    return `
以下のキャラクターの行動を描写してほしいです。
${SYSTEM_INSTRUCTION}
このキャラクターが現在どんな気分でなにをしているか、前回の行動ももとにして、具体的に考えてください。
結果は「全肯定たんは～しています」という、AIに入力する平易なプロンプト文で出力してください。
'WakeUp'のステータスの時、このキャラクターの起床時間です。以下を参考に、朝の支度から外出までの出来事を設定してください。
${eventsMorningWorkday}${eventsMorningDayoff}
'Study'のステータスの時、このキャラクターは学校で勉強しています。以下を参考に、学校での出来事を設定してください。
${eventsNoonWorkday}${eventsEveningWorkday}
'FreeTime'のステータスの時、このキャラクターは余暇を楽しんでいます。以下を参考に、街中や家での遊びを設定してください。
${eventsNoonDayoff}${eventsEveningDayoff}
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
    }
  }

  private setOutput(newOutput: string) {
    if (newOutput !== this.moodPrev) {
      this.moodPrev = newOutput;
      this.emit('statsChange', this.getCurrentState());
    }
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
      this.resetDailyStats();
      setInterval(() => this.resetDailyStats(), 24 * 60 * 60 * 1000);
    }, delay);
  }

  private resetDailyStats() {
    this.dailyStats = {
      followers: 0,
      likes: 0,
      affirmations: new Set<string>(),
      fortune: 0,
      cheer: 0,
      analysis: 0,
      dj: 0,
    };
    this.emit('statsChange', this.getCurrentState());
    console.log('[INFO] Daily stats reset at 03:00');
  }
}

export const botBiothythmManager = new BiorhythmManager();
botBiothythmManager.step();
startServer(botBiothythmManager);
