import {
  BOT_SCENE_BRIEF_JA,
  BOT_VOICE_BRIEF_EN,
  energyLabel,
  timeBandLabel,
  type Status,
} from "@bsky-affirmative-bot/shared-configs";
import { buildRoomEventsSection, type RoomEventForPrompt } from "./roomEventPrompt.js";

/**
 * 各 step の状況描写をローカルの小型モデルに書かせるためのプロンプトと、その出力の検証。
 *
 * 設計の要点は「ローカルには判断させない」こと。今日の服装・いっしょにいる相手・する予定は
 * すべて日次予定表（Gemini）が決めてあり、ここでは決まっている予定を描写に起こすだけにする。
 * 4b モデルでもキャラクターが持つのはこの分担が前提。
 */

export const STATUS_TEXT_MAX_LENGTH = 200;
const STATUS_TEXT_MIN_LENGTH = 10;

const STATUS_MEANINGS: Record<Status, string> = {
  WakeUp: "起きたばかり",
  Study: "勉強中",
  FreeTime: "余暇の時間",
  Relax: "休憩中",
  Sleep: "就寝中（夢の中）",
};

export interface LocalStatusPromptInput {
  status: Status;
  /** 予定表から取り出した今日の予定。 */
  plannedActivity: string;
  outfit: string;
  companion: string;
  moodDirection: string;
  /** 0〜23。プロンプトには時間帯の言葉に直して載せる。 */
  hour: number;
  weather: string;
  /** 0〜100。プロンプトには元気度の言葉に直して載せる。 */
  energy: number;
  moodPrev?: string;
  roomEvents?: RoomEventForPrompt[];
  /** 服装を描写させるか。起床時と、前回の行動が無いとき（再起動直後）だけ true。 */
  describeOutfit: boolean;
}

export function buildLocalStatusPrompt(input: LocalStatusPromptInput): string {
  const roomEvents = input.roomEvents ?? [];
  const hasGift = roomEvents.some((event) => event.type === "gift");

  const outfitLine = input.describeOutfit
    ? `今日の服装: ${input.outfit || "かわいい服（自由に選んでよい）"}`
    : "服装は前回から変わっていないので、服装の描写は不要です。";

  // 時刻とエネルギーは数値ではなく言葉で渡す。小型モデルは数値を渡すと
  //「2026年8月10日16時58分、体力の62％で」のように描写へそのまま書き写してしまう。
  const companion = input.companion || "とくにいない";

  return `${BOT_SCENE_BRIEF_JA}

いまの全肯定たんの様子を、日本語1文〜3文（${STATUS_TEXT_MAX_LENGTH}文字以内）で描写してください。

# 書き方
- 必ず「全肯定たんは、」で書き始めること。
- 三人称の描写文にすること（本人のセリフではありません）。
- 説明・前置き・言い訳・箇条書き・記号・URL・マークダウンは書かないこと。描写の本文だけを書く。
- 描写だけを出力し、それ以外は何も書かないこと。

# いまの状況
ステータス: ${input.status}（${STATUS_MEANINGS[input.status]}）
今日の予定: ${input.plannedActivity}
${outfitLine}
今日いっしょにいる人: ${companion}
今日の気分: ${input.moodDirection || "ふつう"}
時間帯: ${timeBandLabel(input.hour)}
天候: ${input.weather}
元気度: ${energyLabel(input.energy, true)}
前回した行動: ${input.moodPrev || "（記録なし）"}

# ルール
- 「今日の予定」を、いまのステータス・時間帯・天候・元気度に合わせて描写に起こすこと。
- ステータスに合わない行動を書かないこと（${input.status} は「${STATUS_MEANINGS[input.status]}」です）。${
    input.status === "Sleep"
      ? "\n- **いまは眠っています。書けるのは夢の中の出来事だけです。** 誰かが隣にいる、音楽を聴いている、といった現実の様子を混ぜてはいけません。"
      : ""
  }
- **「いま」の様子だけを書くこと。** 「昨日〜した」「さっき〜してきた」のような過去の出来事や、「これから〜する」という未来の予定を作らないこと。
- **登場させてよい人・生きものは「今日いっしょにいる人」（${companion}）と、モルフォ（おうちにいる犬）だけです。** 予定やお部屋のできごとに出てこない友達を勝手に登場させないこと。
- **「今日の予定」に出てくる作品名・曲名・人の名前は、必ずそのまま描写に書くこと。**「ロボットアニメ」「ゲーム」のような一般名詞に言い換えたり、省略したりしてはいけません。
- 上の「いまの状況」のうち、**時刻・日付・数値・パーセント・ステータス名だけ**は描写に書き写さず、情景としてにじませること（作品名や人の名前はこの制限の対象外で、上のとおり必ず書く）。${
    hasGift
      ? "\n- **お部屋でプレゼントをもらっています。必ずその贈り物への言及を入れること**（Sleep中なら夢に出てくる、という扱いでよい）。"
      : ""
  }
${buildRoomEventsSection(roomEvents)}`;
}

/**
 * status_text の英訳用。SYSTEM_INSTRUCTION 全文は 4b モデルには長すぎるので声のブリーフだけ渡す。
 *
 * 固有名詞の綴りを表で固定するのは、放っておくと「全肯定たん」が Zen Kotei-tan / Zankoutei-tan /
 * Zenshin Bot-tan と毎回変わり、ことみちゃんも Komi-chan / Kotoimi-chan と揺れるため。
 * この英訳は mood_en として英語圏のリプライにも出るので、名前が定まらないと別人に見える。
 */
export function buildLocalStatusTranslationPrompt(statusText: string): string {
  return `${BOT_VOICE_BRIEF_EN}

Translate the following third-person Japanese description of Bot-tan into plain English.
It describes what Bot-tan is doing right now.

Use exactly these names, and never romanize them any other way:
- 全肯定たん / 全肯定botたん -> Bot-tan
- ことみちゃん -> Kotomi-chan
- ラテちゃん -> Latte-chan
- モルフォ -> Morpho
- Nagi -> Nagi
- Bluesky -> Bluesky

Rules:
- Keep it third person, starting with "Bot-tan is".
- Keep every fact and title exactly as written. Do not add or remove anything.
- **Output must be entirely in English.** Never leave Japanese characters in the result, including particles, names, and punctuation (use , . ! not 、。！).
- Maximum ${STATUS_TEXT_MAX_LENGTH} characters. No markdown, no quotes, no explanation.
- Output only the English sentence.

Japanese:
${statusText}`;
}

/** 英訳の受け入れ判定。日本語が残っていたら訳し切れていないので使わない。 */
export function validateStatusTextEn(text: string): string | undefined {
  const trimmed = (text ?? "").trim();
  if (!trimmed || trimmed.length > 400) return undefined;
  if (/https?:\/\//i.test(trimmed)) return undefined;
  // ひらがな・カタカナ・漢字・全角句読点が残っていたら訳し漏れ。
  if (/[぀-ヿ一-龯、。！？]/.test(trimmed)) return undefined;
  return trimmed;
}

export type StatusTextRejection =
  | "empty"
  | "too-short"
  | "too-long"
  | "bad-opening"
  | "markup"
  | "url"
  | "too-many-lines"
  | "keigo"
  | "raw-context";

/**
 * プロンプトの材料をそのまま書き写した跡。
 *
 * 数値と日時はラベルで渡すようにしたので本来出ないが、小型モデルはたまに書く。
 * この描写は biorhythm_history に入って一日中あちこちで語られるので、
 * 「2026年8月10日16時58分、体力の62％で」のような機械的な文は通さない。
 * 「3時のおやつ」を巻き添えにしないよう、時刻は「分」まで揃っている場合だけ弾く。
 */
const RAW_CONTEXT_PATTERNS = [
  /\d{4}年/,
  /\d{1,2}時\d{1,2}分/,
  /\d{1,2}:\d{2}/,
  /\d+\s*[%％]/,
  /体力気力/,
  /ステータス/,
];

/**
 * ローカル出力の受け入れ判定。
 *
 * status_text は biorhythm_history に入り、そこからリプライ・定期ポスト・日記へ伝播する。
 * 壊れた1件が一日中あちこちに出続けるので、明らかにおかしいものはここで落として
 * Gemini のフォールバックに回す。お部屋のできごと（ユーザー自由入力）経由の
 * プロンプトインジェクションに対しても、URL・記号・長さの検査が二重の防御になる。
 */
export function validateStatusText(
  text: string,
): { ok: true; text: string } | { ok: false; reason: StatusTextRejection } {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length < STATUS_TEXT_MIN_LENGTH) return { ok: false, reason: "too-short" };
  if (trimmed.length > STATUS_TEXT_MAX_LENGTH) return { ok: false, reason: "too-long" };
  if (!trimmed.startsWith("全肯定たん")) return { ok: false, reason: "bad-opening" };
  if (/https?:\/\//i.test(trimmed)) return { ok: false, reason: "url" };
  // マークダウンの見出し・強調・リスト・リンク。小型モデルが説明文を足すときの典型。
  if (/(\*\*|^#{1,6}\s|^[-*]\s|\[[^\]]*\]\()/m.test(trimmed)) {
    return { ok: false, reason: "markup" };
  }
  if (trimmed.split("\n").length > 2) return { ok: false, reason: "too-many-lines" };
  if (RAW_CONTEXT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { ok: false, reason: "raw-context" };
  }
  // 三人称の描写なので「〜しています」は許す。それ以外の敬語が出たら説明文が混じっている。
  if (/(ください|ございます|いたします|申し訳)/.test(trimmed)) {
    return { ok: false, reason: "keigo" };
  }
  return { ok: true, text: trimmed };
}
