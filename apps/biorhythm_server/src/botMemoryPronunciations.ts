import { generateContentWithRetry } from "@bsky-affirmative-bot/bot-brain";
import {
  getPendingBotMemoryPronunciations,
  ensureDefaultBotMemoryPronunciations,
  isEligiblePronunciationSurface,
  isValidSpokenForm,
  normalizePronunciationSurface,
  normalizeSpokenForm,
  saveBotMemoryPronunciationInference,
  type BotMemoryPronunciationInference,
  type PendingBotMemoryPronunciation,
} from "@bsky-affirmative-bot/database";
import { Type } from "@google/genai";

const BATCH_SIZE = 16;
const BUSY_INTERVAL_MS = 5 * 60_000;
const IDLE_INTERVAL_MS = 10 * 60_000;
let running = false;
let defaultsEnsured = false;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          impressionId: { type: Type.INTEGER },
          surface: { type: Type.STRING },
          eligible: { type: Type.BOOLEAN },
          kind: { type: Type.STRING, description: "work / proper_noun / ignore" },
          spokenForm: { type: Type.STRING },
        },
        required: ["impressionId", "surface", "eligible", "kind", "spokenForm"],
      },
    },
  },
  required: ["items"],
};

export function buildBotMemoryPronunciationPrompt(
  candidates: PendingBotMemoryPronunciation[],
) {
  return `読み上げ用の固有名詞辞書候補を判定し、日本語で自然に発音できるカタカナ表記を返してください。

# 対象
- kind=work は作品名として対象にする。
- kind=word は、作品、商品、サービス、組織、技術用語、架空キャラクターなど、文脈が変わっても読みが一定の非個人固有名詞だけ対象にする。
- 実在人物名、視聴者名、ハンドル、一般語、地名、1〜2文字の語は対象外。

# 発話表記
- カタカナ、長音「ー」、中点「・」、読点「、」、空白だけを使う。
- 複合語を一続きにすると誤解されやすい場合は「、」で自然な短い区切りを入れる。
- 表記を翻訳・別名化せず、読みだけを示す。
- 対象外では eligible=false、kind=ignore、spokenForm="" とする。
- impressionId と surface は入力をそのまま返す。入力にない項目を追加しない。

例: 攻殻機動隊 → コウカク、キドウタイ

${JSON.stringify(candidates.map((item) => ({
    impressionId: item.impressionId,
    surface: item.surface,
    kind: item.impressionKind,
  })))}`;
}

export function parseBotMemoryPronunciations(
  raw: unknown,
  candidates: PendingBotMemoryPronunciation[],
): Map<number, BotMemoryPronunciationInference> {
  const byId = new Map(candidates.map((candidate) => [candidate.impressionId, candidate]));
  const result = new Map<number, BotMemoryPronunciationInference>();
  const items = raw && typeof raw === "object" && Array.isArray((raw as any).items)
    ? (raw as any).items
    : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const candidate = byId.get(Number(item.impressionId));
    if (!candidate || result.has(candidate.impressionId)) continue;
    const surface = typeof item.surface === "string"
      ? normalizePronunciationSurface(item.surface)
      : "";
    if (surface !== normalizePronunciationSurface(candidate.surface)) continue;
    const kind = item.kind === "work" || item.kind === "proper_noun"
      ? item.kind
      : candidate.impressionKind === "work" ? "work" : "proper_noun";
    const spokenForm = typeof item.spokenForm === "string"
      ? normalizeSpokenForm(item.spokenForm)
      : "";
    const eligibleKind = candidate.impressionKind === "work"
      ? kind === "work"
      : kind === "proper_noun";
    const eligible = item.eligible === true && eligibleKind &&
      isEligiblePronunciationSurface(surface) && isValidSpokenForm(spokenForm);
    result.set(candidate.impressionId, {
      surface,
      spokenForm: eligible ? spokenForm : null,
      kind: candidate.impressionKind === "work" ? "work" : "proper_noun",
      eligible,
    });
  }
  for (const candidate of candidates) {
    if (!result.has(candidate.impressionId)) {
      result.set(candidate.impressionId, {
        surface: normalizePronunciationSurface(candidate.surface),
        spokenForm: null,
        kind: candidate.impressionKind === "work" ? "work" : "proper_noun",
        eligible: false,
      });
    }
  }
  return result;
}

export async function processBotMemoryPronunciationBatch(
  deps: {
    fetchPending?: typeof getPendingBotMemoryPronunciations;
    save?: typeof saveBotMemoryPronunciationInference;
    generate?: typeof generateContentWithRetry;
  } = {},
): Promise<number> {
  const fetchPending = deps.fetchPending ?? getPendingBotMemoryPronunciations;
  const save = deps.save ?? saveBotMemoryPronunciationInference;
  const generate = deps.generate ?? generateContentWithRetry;
  const pending = await fetchPending(BATCH_SIZE);
  if (pending.length === 0) return 0;
  const response = await generate({
    feature: "BIORHYTHM_TTS_PRONUNCIATIONS",
    maxTextLength: null,
    contents: [buildBotMemoryPronunciationPrompt(pending)],
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });
  const parsed = parseBotMemoryPronunciations(JSON.parse(response.text || "{}"), pending);
  let saved = 0;
  for (const candidate of pending) {
    const inference = parsed.get(candidate.impressionId)!;
    const next = await save(candidate.impressionId, inference);
    if (next) {
      saved++;
      if (inference.eligible && inference.spokenForm && next.origin === "auto" &&
          next.status === "active" && next.spokenForm !== inference.spokenForm) {
        console.warn("[WARN][TTS_PRONUNCIATION] conflicting reading kept existing value", {
          surface: next.surface,
          conflictCount: next.conflictCount,
        });
      }
    }
  }
  return saved;
}

export function startBotMemoryPronunciationWorker() {
  if (running) return;
  running = true;
  const loop = async () => {
    let processed = 0;
    try {
      if (!defaultsEnsured) {
        await ensureDefaultBotMemoryPronunciations();
        defaultsEnsured = true;
      }
      processed = await processBotMemoryPronunciationBatch();
    } catch (error) {
      console.error("[ERROR][TTS_PRONUNCIATION]", error);
    }
    const timer = setTimeout(
      () => void loop(),
      processed > 0 ? BUSY_INTERVAL_MS : IDLE_INTERVAL_MS,
    );
    timer.unref?.();
  };
  void loop();
}
