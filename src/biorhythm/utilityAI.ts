import { Status } from ".";

// Utility関数の型定義
type UtilityFunction = (state: SimulationState) => number;

// シミュレーション状態の型
export interface SimulationState {
  hour: number;           // 0-23時
  isWeekend: boolean;     // 休日かどうか
  energy: number;         // 元気度 0-100
  currentAction: string;  // 現在の行動
}

// 各行動のUtility関数
export class UtilityAI {
  /**
   * 循環ガウシアン関数（24時間対応）
   * @param hour 現在の時刻
   * @param peak ピーク時刻（最も高い値になる時間）
   * @param sigma 標準偏差（幅の広さ）
   * @returns 0-1の範囲の値
   */
  private static circularGaussian(hour: number, peak: number, sigma: number): number {
    // 最短距離を計算（循環を考慮）
    let diff = Math.abs(hour - peak);
    if (diff > 12) diff = 24 - diff;
    
    return Math.exp(-(diff ** 2) / (2 * sigma ** 2));
  }

  // 睡眠のUtility
  private static sleep: UtilityFunction = (state) => {
    // 深夜2時を中心に睡眠欲求（夜更かし後の睡眠）
    const nightSleepScore = this.circularGaussian(state.hour, 2, 3) * 100;
    
    // 朝の二度寝欲求（朝に弱い設定：朝7時ピーク）
    const morningSleepScore = this.circularGaussian(state.hour, 7, 1.5) * 70;
    
    // 日中は睡眠の価値が低い
    const daytimePenalty = this.circularGaussian(state.hour, 14, 4) * -50;
    
    // 元気がないほど睡眠の価値が高い
    const energyFactor = (100 - state.energy) * 0.8;
    
    return Math.max(0, nightSleepScore + morningSleepScore + daytimePenalty + energyFactor);
  };

  // 起床のUtility
  private static wakeUp: UtilityFunction = (state) => {
    // 朝7時を中心に起床の価値（でも朝に弱いので低め）
    const morningWakeScore = this.circularGaussian(state.hour, 7, 1.5) * 50;
    
    // 平日は起床の必要性が高い（義務感）
    let weekdayBonus = 0;
    if (!state.isWeekend && state.hour >= 6 && state.hour <= 8) {
      weekdayBonus = 50;
    }
    
    // 元気があっても朝は眠い（係数低め）
    const energyFactor = state.energy * 0.2;
    
    return Math.max(0, morningWakeScore + weekdayBonus + energyFactor);
  };

  // 勉強のUtility
  private static study: UtilityFunction = (state) => {
    let score = 0;
    
    // 平日の学校時間（12時を中心に8-16時の範囲）
    if (!state.isWeekend) {
      const schoolTimeScore = this.circularGaussian(state.hour, 12, 3) * 120;
      score += schoolTimeScore;
    }
    
    // 放課後の勉強時間（18時を中心）
    const afterSchoolScore = this.circularGaussian(state.hour, 18, 2) * 40;
    score += afterSchoolScore;
    
    // 休日でも適度に勉強（14時を中心、平日より低い）
    if (state.isWeekend) {
      const weekendStudyScore = this.circularGaussian(state.hour, 14, 3) * 40;
      score += weekendStudyScore;
    }
    
    // 元気がないと勉強の価値が下がる
    if (state.energy < 30) {
      score -= 60;
    } else if (state.energy > 60) {
      score += 20;
    }
    
    return Math.max(0, score);
  };

  // 自由時間のUtility（ゲーム好き・夜更かし傾向）
  private static freetime: UtilityFunction = (state) => {
    // 深夜ゲームタイム（22時を中心に大きなピーク）
    const nightGamingScore = this.circularGaussian(state.hour, 22, 3) * 100;
    
    // 休日の昼間のゲームタイム（14時を中心）
    let weekendDayScore = 0;
    if (state.isWeekend) {
      weekendDayScore = this.circularGaussian(state.hour, 14, 4) * 70;
    }
    
    // 平日の放課後（17時を中心）
    let afterSchoolScore = 0;
    if (!state.isWeekend) {
      afterSchoolScore = this.circularGaussian(state.hour, 17, 2) * 60;
    }
    
    // 元気があるほどゲームしたい
    const energyBonus = state.energy >= 40 ? 30 : 0;
    
    return Math.max(0, nightGamingScore + weekendDayScore + afterSchoolScore + energyBonus);
  };

  // リラックスのUtility
  private static relax: UtilityFunction = (state) => {
    // 夕方のリラックスタイム（19時を中心）
    const eveningRelaxScore = this.circularGaussian(state.hour, 19, 2.5) * 80;
    
    // 元気がないときはリラックスが必要
    const energyFactor = state.energy < 50 ? (50 - state.energy) * 1.2 : 0;
    
    // 休日はいつでもリラックス可能
    const weekendBonus = state.isWeekend ? 20 : 0;
    
    return Math.max(0, eveningRelaxScore + energyFactor + weekendBonus);
  };

  // 最適な行動を選択
  static selectAction(state: SimulationState): Status {
    const utilities: Record<Status, number> = {
      'Sleep': this.sleep(state),
      'WakeUp': this.wakeUp(state),
      'Study': this.study(state),
      'FreeTime': this.freetime(state),
      'Relax': this.relax(state),
    };
    console.log(`[INFO][UTILITY_AI] hour=${state.hour}, energy=${state.energy}, ${JSON.stringify(utilities)}`);

    // 温度パラメータ（t）
    // t が大きいほどランダム、小さいほど決定的
    const temperature = 15;  // 推奨: 5〜20

    // Softmax の計算： exp(U / t)
    const expValues: Record<Status, number> = {} as any;
    let sumExp = 0;

    for (const action of Object.keys(utilities) as Status[]) {
      const value = Math.exp(utilities[action] / temperature);
      expValues[action] = value;
      sumExp += value;
    }

    // ランダム抽選
    let r = Math.random() * sumExp;

    for (const action of Object.keys(expValues) as Status[]) {
      r -= expValues[action];
      if (r <= 0) {
        return action;
      }
    }

    // 万が一（理論上は起きない）
    return 'Relax';
  }
}
