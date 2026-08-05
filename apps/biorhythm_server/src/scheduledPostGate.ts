import type { Status } from "@bsky-affirmative-bot/shared-configs";

/**
 * 定期ポストを撃つかどうかの判定だけを切り出したもの。
 *
 * step() 本体は LLM・DB・投稿を巻き込むので条件を直接テストできない。ここが素の関数に
 * なっていれば、「おはようより先に定期つぶやきが出る」たぐいの事故を単体テストで固定できる。
 */

/** 定期つぶやきに必要な体力気力（0〜100スケール）。 */
export const WHIMSICAL_MIN_ENERGY = 60;

/**
 * おやすみを言ってからおはようを言うまでの区間かどうか。
 *
 * 日付文字列どうしの大小で比べているのがミソ。botDayRange() の一日は4時始まりなので、
 * おやすみは bot 日 D に、その翌朝のおはようは D+1 に記録される。両者を同じ `today` と
 * 突き合わせる書き方（`lastGoodNight === today && lastGoodMorning !== today`）だと、
 * 就寝中に true になる瞬間が一度も存在しない。
 */
export function isSleepingPeriod(
  lastGoodNightPostDate?: string,
  lastGoodMorningPostDate?: string,
): boolean {
  if (!lastGoodNightPostDate) return false;
  if (!lastGoodMorningPostDate) return true;
  return lastGoodMorningPostDate <= lastGoodNightPostDate;
}

/**
 * おはようポストを撃つか。
 *
 * 「Sleep → WakeUp の遷移が起きた step」ではなく「その bot 日にまだ撃っておらず、いま
 * 起きている」で判定する。遷移を条件にすると、前夜から起きっぱなしだったり二度寝を挟んだり
 * した朝に撃ち漏らす。時刻の窓も持たない（寝坊した日は起きた時点で撃つ）。
 */
export function shouldPostGoodMorning(args: {
  status: Status;
  today: string;
  lastGoodMorningPostDate?: string;
}): boolean {
  return args.status !== "Sleep" && args.lastGoodMorningPostDate !== args.today;
}

/**
 * 定期つぶやきの抽選まで進んでよいか。抽選そのものは呼び出し側に残す。
 *
 * 開発時はエネルギーも就寝中判定も無視する（ローカルで夜に動かしても試せるように）。
 */
export function shouldConsiderWhimsicalPost(args: {
  status: Status;
  energy: number;
  lastGoodNightPostDate?: string;
  lastGoodMorningPostDate?: string;
  isDevelopment: boolean;
}): boolean {
  if (args.isDevelopment) return true;
  if (isSleepingPeriod(args.lastGoodNightPostDate, args.lastGoodMorningPostDate)) {
    return false;
  }
  return args.status !== "Sleep" && args.energy >= WHIMSICAL_MIN_ENERGY;
}
