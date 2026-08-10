import {
  generateContentWithRetry,
  isOllamaConfigured,
  ollamaChat,
} from "@bsky-affirmative-bot/bot-brain";
import eventsMorningWorkday from "@bsky-affirmative-bot/shared-configs/json/event_morning_workday.json" with { type: "json" };
import eventsMorningDayoff from "@bsky-affirmative-bot/shared-configs/json/event_morning_dayoff.json" with { type: "json" };
import eventsNoonWorkday from "@bsky-affirmative-bot/shared-configs/json/event_noon_workday.json" with { type: "json" };
import eventsNoonDayoff from "@bsky-affirmative-bot/shared-configs/json/event_noon_dayoff.json" with { type: "json" };
import eventsEveningWorkday from "@bsky-affirmative-bot/shared-configs/json/event_evening_workday.json" with { type: "json" };
import eventsEveningDayoff from "@bsky-affirmative-bot/shared-configs/json/event_evening_dayoff.json" with { type: "json" };
import eventsNight from "@bsky-affirmative-bot/shared-configs/json/event_night.json" with { type: "json" };
import eventsMidnight from "@bsky-affirmative-bot/shared-configs/json/event_midnight.json" with { type: "json" };
import { MemoryService } from "@bsky-affirmative-bot/clients";
import { SYSTEM_INSTRUCTION, type Status } from "@bsky-affirmative-bot/shared-configs";
import { Type } from "@google/genai";
import {
  DAILY_PLAN_STATE_KEY,
  ensureDailyPlan,
  takePlannedEvent,
  type DailyPlan,
} from "./dailyPlan.js";
import {
  buildLocalStatusPrompt,
  buildLocalStatusTranslationPrompt,
  validateStatusText,
  validateStatusTextEn,
} from "./localStatusPrompt.js";
import type { RoomEventForPrompt } from "./roomEventPrompt.js";

/**
 * 状況描写のローカル出力と Gemini 出力を並べて見るためのプレビュー。
 * 投稿もDB書き込み（履歴・biorhythm state）もしない。
 *
 * 4bモデルがこの描写を書けるかは実際に並べないと判断できないので、
 * ローカル化を本番へ入れる前にここで見る。
 *
 * 実行: pnpm --filter biorhythm-server status:preview
 * 注意: 日次予定表だけは bot_state を読み書きする（ensureDailyPlan）。
 */

const PREVIEW_STATUSES: Status[] = ["WakeUp", "Study", "FreeTime", "Relax", "Sleep"];

/** manager.eventSamplesForPlan() と同じ材料。本番と違う予定表を見て判断しないため。 */
const isWeekendToday = [0, 6].includes(new Date().getDay());
const EVENT_SAMPLES: Record<string, unknown> = {
  WakeUp: isWeekendToday ? eventsMorningDayoff : eventsMorningWorkday,
  Study: isWeekendToday ? eventsNoonDayoff : eventsNoonWorkday,
  FreeTime: isWeekendToday ? eventsEveningDayoff : eventsEveningWorkday,
  Relax: eventsNight,
  Sleep: eventsMidnight,
};

/** お部屋のできごとが混ざったときの挙動も見たいので、1件だけ用意する。 */
const SAMPLE_ROOM_EVENTS: RoomEventForPrompt[] = [
  { name: "すいばり", type: "gift", detail: "チョコレートケーキ", minutesAgo: 25 },
];

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

async function generateWithGemini(prompt: string) {
  const response = await generateContentWithRetry({
    feature: "BIORHYTHM_STATUS",
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          status_text: { type: Type.STRING },
          status_text_en: { type: Type.STRING },
          duration_minutes: { type: Type.INTEGER },
        },
        required: ["status_text", "status_text_en", "duration_minutes"],
      },
    },
  });
  return JSON.parse(response.text || "{}") as {
    status_text?: string;
    status_text_en?: string;
    duration_minutes?: number;
  };
}

async function previewStatus(plan: DailyPlan, status: Status, withRoomEvents: boolean) {
  const picked = takePlannedEvent(plan, status);
  console.log(`\n===== ${status}${withRoomEvents ? " (+ room gift)" : ""} =====`);
  if (!picked) {
    console.log("(予定表にこのステータスのイベントがありません)");
    return;
  }
  console.log(`予定: ${picked.event.activity}  /  ${picked.event.durationMinutes}分`);

  const prompt = buildLocalStatusPrompt({
    status,
    plannedActivity: picked.event.activity,
    outfit: plan.outfit,
    companion: plan.companion,
    moodDirection: plan.moodDirection,
    hour: new Date().getHours(),
    weather: "晴れ",
    energy: 62,
    moodPrev: "全肯定たんは、机に向かって課題のノートを開いています。",
    roomEvents: withRoomEvents ? SAMPLE_ROOM_EVENTS : [],
    describeOutfit: status === "WakeUp",
  });

  if (isOllamaConfigured()) {
    try {
      const raw = await ollamaChat(
        "OLLAMA_BIORHYTHM_STATUS",
        [{ role: "user", content: prompt }],
        { maxTokens: 400, temperature: 0.9, timeoutMs: 60_000 },
      );
      const validated = validateStatusText(raw);
      console.log(
        `[LOCAL ] ${validated.ok ? "OK" : `REJECT(${validated.reason})`}: ${oneLine(raw)}`,
      );
      if (validated.ok) {
        const en = await ollamaChat(
          "OLLAMA_BOT_TRANSLATION",
          [{ role: "user", content: buildLocalStatusTranslationPrompt(validated.text) }],
          { maxTokens: 300, temperature: 0.2, timeoutMs: 60_000 },
        );
        const enOk = validateStatusTextEn(en);
        console.log(`[LOCAL•en] ${enOk ? "OK" : "REJECT"}: ${oneLine(en)}`);
      }
    } catch (error) {
      console.log(`[LOCAL ] ERROR: ${(error as Error).message}`);
    }
  } else {
    console.log("[LOCAL ] skipped (OLLAMA_BASE_URL / OLLAMA_MODEL が未設定)");
  }

  try {
    // Gemini 側は本番と同じ buildPrompt を使えないので（manager のインスタンス状態に依存する）、
    // ローカルと同じ材料を渡して描写だけを比べる。
    const gemini = await generateWithGemini(prompt);
    console.log(`[GEMINI] ${oneLine(gemini.status_text ?? "")}`);
    console.log(`[GEMINI•en] ${oneLine(gemini.status_text_en ?? "")}`);
  } catch (error) {
    console.log(`[GEMINI] ERROR: ${(error as Error).message}`);
  }
}

async function main() {
  // 予定表は bot_state に1日キャッシュされるので、プロンプトを直した直後に回すと
  // 古い予定表がそのまま出てくる。作り直したいときはこのフラグを付ける。
  if (process.argv.includes("--fresh") || process.env.PLAN_REFRESH === "1") {
    await MemoryService.setBotState(DAILY_PLAN_STATE_KEY, null);
    console.log("(--fresh: 今日の予定表を作り直します)");
  }

  const plan = await ensureDailyPlan({
    isWeekend: [0, 6].includes(new Date().getDay()),
    eventSamples: EVENT_SAMPLES,
  });
  if (!plan) {
    console.error("日次予定表を作れませんでした。GEMINI_API_KEY と DB 接続を確認してください。");
    process.exitCode = 1;
    return;
  }

  console.log("=== 今日の予定表 ===");
  console.log(`服装: ${plan.outfit}`);
  console.log(`いっしょにいる人: ${plan.companion}`);
  console.log(`気分: ${plan.moodDirection}`);
  console.log(`イベント数: ${plan.events.length}`);
  for (const event of plan.events) {
    console.log(`  - [${event.status}] ${event.activity} (${event.durationMinutes}分)`);
  }

  for (const status of PREVIEW_STATUSES) {
    await previewStatus(plan, status, false);
  }
  // gift の言及必須ルールが効くかを1ケースだけ確認する。
  await previewStatus(plan, "FreeTime", true);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
