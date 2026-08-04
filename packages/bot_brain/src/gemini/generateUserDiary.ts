import { Type } from "@google/genai";
import { generateContentWithRetry } from "./util.js";
import {
  UserInfoGemini,
  SYSTEM_INSTRUCTION,
  TONE_RULES_JA,
  safeFetch,
} from "@bsky-affirmative-bot/shared-configs";

export interface DiaryResult {
  diary: string;
  title_ja: string;
  title_en: string;
  emoji: string;
}

export type RecentDiaryEmoji = {
  date: string;
  emoji: string;
};

const ABSTRACT_DIARY_EMOJIS = new Set([
  "✨",
  "💬",
  "⭐",
  "🌟",
  "💫",
  "🔥",
  "💥",
  "🎉",
  "🎊",
  "💡",
  "🌱",
  "❤️",
  "🩷",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
  "🤍",
  "🖤",
  "🤎",
  "💕",
  "💖",
  "💗",
  "💓",
  "💞",
  "💝",
  "💘",
  "💟",
  "❣️",
  "✅",
  "☑️",
  "✔️",
  "⭕",
  "❌",
  "❗",
  "❓",
  "‼️",
  "⁉️",
  "🗨️",
  "🗯️",
  "👍",
  "👎",
  "👏",
  "🙏",
  "💪",
  "👌",
  "✌️",
  "🎌",
]);

/** 見た目や意味が近く、日をまたいで並ぶと識別力が落ちる絵文字群。 */
const DIARY_EMOJI_SIMILAR_GROUPS = [
  ["💻", "🖥️", "⌨️", "🖱️", "📱", "📲", "📟", "💾", "🖨️", "🧑‍💻", "👨‍💻", "👩‍💻"],
  ["🐈", "🐈‍⬛", "🐱"],
  ["🐕", "🐕‍🦺", "🦮", "🐶"],
  ["🎵", "🎶", "🎼"],
  ["📸", "📷", "🎥"],
  ["✍️", "📝", "✏️", "🖊️", "🖋️", "🖍️"],
  ["🚃", "🚆", "🚄", "🚅", "🚇", "🚈", "🚉"],
  ["🚗", "🚙", "🏎️", "🚕"],
  ["🚲", "🚴", "🚴‍♀️", "🚴‍♂️"],
  ["📚", "📖", "📕", "📗", "📘", "📙"],
] as const;

const diaryEmojiSimilarityKeys = new Map<string, number>(
  DIARY_EMOJI_SIMILAR_GROUPS.flatMap((group, index) =>
    group.map((emoji) => [emoji, index] as const),
  ),
);

function diaryEmojiSimilarityKey(emoji: string): string {
  const group = diaryEmojiSimilarityKeys.get(emoji);
  return group === undefined ? `emoji:${emoji}` : `group:${group}`;
}

const diaryEmojiPromptRules = `
絵文字は、本文に実際に登場する出来事を見分けられる、異なる具体的なUnicode絵文字の候補を関連度順に10個選んでください。候補から検証済みの上位3つを最終表示に使います。
- 食べ物、乗り物、場所、動物、道具、スポーツ、創作物など、「何が起きたか」を指す具体物・具体的活動を優先する
- 候補はすべて本文またはポストに根拠があるものにし、書かれていない出来事を推測で足さない。同じ出来事の異なる具体物を候補にしてよい
- 同じ日の候補内でも、同じ絵文字の別表現ばかりにしない（例: 🐈と🐈‍⬛、💻と🖥️、🎵と🎶を同時に選ばない）
- 顔、ハート、吹き出し、光、記号など、単なる装飾、気分、会話、称賛、勢い、達成感を表す抽象的な絵文字は禁止する
- 禁止例: ✨ 💬 😊 ❤️ 🎉 ⭐ 🌟 💫 🔥 🌱 ✅
- 良い例: ラーメンを食べ、電車で移動し、ギターを弾いた日 → ["🍜", "🚃", "🎸", "🥢", "🚉", "🎵", "🍥", "🚆", "🎼", "🎹"]
- 体調を崩して休んだ日 → ["🌡️", "💊", "🛏️", "🏥", "🩹", "🫖", "🩺", "🥣", "🏠", "🧦"]
- ソフトウェア開発をした日 → ["💻", "⚙️", "🛠️", "🔧", "🌐", "🏷️", "🚀", "🧩", "🐛", "📦"]`;

function recentDiaryEmojiPrompt(
  recentEmojis: RecentDiaryEmoji[] = [],
  lang: "ja" | "en" = "ja",
): string {
  if (!recentEmojis.length) return "";
  const history = recentEmojis
    .map((entry) => `- ${entry.date}: ${entry.emoji}`)
    .join("\n");
  if (lang === "en") {
    return `
The following emoji were used in diary entries from the previous three days:
${history}
Do not reuse any of these exact emoji today. When the text supports other concrete events, also avoid visually or semantically similar alternatives, such as 🐱 for 🐈 or 🖥️ for 💻. Never invent an event merely to avoid repetition.`;
  }
  return `
過去3日の日記では次の絵文字を使いました。
${history}
今日の候補には、これらと同じ絵文字を使わないでください。また、🐈に対する🐱、💻に対する🖥️のように、見た目や意味がよく似た絵文字も、本文に別の具体的な出来事がある限り避けてください。重複回避のために本文にない出来事を作ってはいけません。`;
}

function diaryEmojiGraphemes(value: string): string[] {
  return [
    ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
      value,
    ),
  ].map(({ segment }) => segment);
}

function isUnicodeEmoji(value: string): boolean {
  return (
    /\p{Extended_Pictographic}/u.test(value) ||
    /^\p{Regional_Indicator}{2}$/u.test(value)
  );
}

function isAbstractDiaryEmoji(value: string): boolean {
  const codePoint = value.codePointAt(0);
  return (
    ABSTRACT_DIARY_EMOJIS.has(value) ||
    (codePoint !== undefined &&
      ((codePoint >= 0x1f600 && codePoint <= 0x1f64f) ||
        (codePoint >= 0x1f910 && codePoint <= 0x1f92f) ||
        (codePoint >= 0x1f970 && codePoint <= 0x1f97f) ||
        (codePoint >= 0x1fae0 && codePoint <= 0x1faef)))
  );
}

/** Gemini の出力を、カレンダーにそのまま置ける具体的な3絵文字へ絞る。 */
export function normalizeDiaryEmoji(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Diary emoji must be a string");
  }
  const emoji = value.trim();
  const graphemes = diaryEmojiGraphemes(emoji);
  if (
    graphemes.length !== 3 ||
    new Set(graphemes).size !== 3 ||
    Buffer.byteLength(emoji) > 192 ||
    graphemes.some(
      (item) => !isUnicodeEmoji(item) || isAbstractDiaryEmoji(item),
    )
  ) {
    throw new Error(
      `Diary emoji must contain exactly 3 concrete Unicode emoji: ${JSON.stringify(value)}`,
    );
  }
  return emoji;
}

/** モデルの複数候補から、禁止対象を除いた具体的な上位3絵文字を選ぶ。 */
export function selectDiaryEmojis(
  value: unknown,
  recentEmojis: RecentDiaryEmoji[] = [],
): string {
  if (!Array.isArray(value)) {
    throw new Error("Diary emoji candidates must be an array");
  }
  const excluded = new Set(
    recentEmojis.flatMap((entry) =>
      diaryEmojiGraphemes(entry.emoji).map(diaryEmojiSimilarityKey),
    ),
  );
  const selected: string[] = [];
  const selectedSimilarityKeys = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string") continue;
    const emoji = candidate.trim();
    const graphemes = diaryEmojiGraphemes(emoji);
    if (
      graphemes.length !== 1 ||
      !isUnicodeEmoji(emoji) ||
      isAbstractDiaryEmoji(emoji) ||
      excluded.has(diaryEmojiSimilarityKey(emoji)) ||
      selectedSimilarityKeys.has(diaryEmojiSimilarityKey(emoji)) ||
      selected.includes(emoji)
    ) {
      continue;
    }
    selected.push(emoji);
    selectedSimilarityKeys.add(diaryEmojiSimilarityKey(emoji));
    if (selected.length === 3) break;
  }
  return normalizeDiaryEmoji(selected.join(""));
}

export async function generateUserDiary(
  userinfo: UserInfoGemini,
  options: { recentEmojis?: RecentDiaryEmoji[] } = {},
): Promise<DiaryResult> {
  const maxLength =
    userinfo.langStr === "日本語"
      ? "出力する日記本文の文字数は最大500文字までです。"
      : "The diary body content can be up to 1000 characters.";

  const prompt =
    userinfo.langStr === "日本語"
      ? `ユーザの今日1日の日記をつけてあげてください。ユーザのポストを総括して、あなたの感想を述べてください。
日記の目的はユーザのストレスを軽減し、自律神経を整えて、明日へのモチベーションを高めることです。
日本語で出力してください。
${maxLength}
日記本文には以下の要素を含めてください。
* 今日失敗したこと
* 今日一番よかったこと、心が動いたこと
* 明日の目標
悪い内容は含まず、全肯定のスタンスで出力してください。

# 口調
ユーザのポストがどんな文体でも、日記本文は必ずあなた自身の口調で書いてください。
${TONE_RULES_JA}

また、ユーザの今日1日のポスト内容や様子から、今日1日を象徴するユーザにふさわしい「称号」を考えてください。
称号は、日本語（20字以内）と、その英語訳（30字以内）の両方を考えてください。
${diaryEmojiPromptRules}${recentDiaryEmojiPrompt(options.recentEmojis)}
例：
- 日本語: 「努力の守護者」, 英語: 「Guardian of Effort」
- 日本語: 「癒やしの案内人」, 英語: 「Guide of Healing」

以下がユーザ名およびポストです。
-----
ユーザ名: ${userinfo.follower.displayName}
今日1日のポスト内容: ${userinfo.posts || ""}
`
      : `Please write a daily diary for the user. Summarize their posts and share your warm feedback.
The purpose of the diary is to reduce their stress, regulate their autonomic nervous system, and boost their motivation for tomorrow.
Please output in ${userinfo.langStr}.
${maxLength}
Include the following elements in the diary body:
* Today's challenges/failures (approached fully positively)
* Today's highlight/best moments
* Tomorrow's goals
Do not include any negative content; keep a fully positive, affirming stance.

Also, based on their posts, award them a fitting "title".
Provide the title in both Japanese (within 20 characters) and English (within 30 characters).
Also provide exactly ten different, concrete Unicode emoji candidates, ordered by relevance. The first three candidates that pass validation will be displayed.
- Prefer specific foods, vehicles, places, animals, tools, sports, or creative activities explicitly supported by the posts.
- Never invent an event that is not supported by the posts.
- Do not fill the same day's candidates with near-identical alternatives such as 🐈 and 🐈‍⬛, 💻 and 🖥️, or 🎵 and 🎶.
- Do not use faces, hearts, speech bubbles, light, symbols, or other abstract decoration, emotion, conversation, praise, momentum, or achievement symbols.
- Forbidden examples: ✨ 💬 😊 ❤️ 🎉 ⭐ 🌟 💫 🔥 🌱 ✅
- Good example: ramen, a train ride, and playing guitar → ["🍜", "🚃", "🎸", "🥢", "🚉", "🎵"]
${recentDiaryEmojiPrompt(options.recentEmojis, "en")}
Examples:
- Japanese: 「努力の守護者」, English: 「Guardian of Effort」
- Japanese: 「全肯定の達人」, English: 「Master of Affirmation」

-----
Username: ${userinfo.follower.displayName}
Today's posts: ${userinfo.posts || ""}
`;

  const contents: any[] = [prompt];

  if (userinfo?.image) {
    for (const img of userinfo.image) {
      try {
        const response = await safeFetch(img.image_url);
        if (!response.ok) {
          console.warn(
            `[WARN] Failed to fetch image: ${img.image_url} (Status: ${response.status})`,
          );
          continue;
        }
        const imageArrayBuffer = await response.arrayBuffer();
        const base64ImageData =
          Buffer.from(imageArrayBuffer).toString("base64");
        contents.push({
          inlineData: {
            mimeType: img.mimeType,
            data: base64ImageData,
          },
        });
      } catch (e) {
        console.warn(`[WARN] Error fetching image: ${img.image_url}`, e);
        continue;
      }
    }
  }

  const response = await generateContentWithRetry(
    {
      feature: "COMMON_USER_DIARY",
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            diary: {
              type: Type.STRING,
              description:
                "今日1日の日記本文（今日失敗したこと、今日一番よかったこと、明日の目標を含め、全肯定のスタンスで書くこと）",
            },
            title_ja: {
              type: Type.STRING,
              description:
                "今日1日を象徴するユーザーにふさわしい日本語の称号（20字以内、例: 努力の守護者）",
            },
            title_en: {
              type: Type.STRING,
              description:
                "同じ称号の英語訳（30字以内、例: Guardian of Effort）",
            },
            emojiCandidates: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              minItems: "10",
              maxItems: "10",
              description:
                "実際の出来事が分かる、異なる具体的なUnicode絵文字候補10個。関連度順。抽象的・装飾的な絵文字は禁止",
            },
          },
          required: ["diary", "title_ja", "title_en", "emojiCandidates"],
        },
      },
    },
    3,
    userinfo,
  );

  const responseText = response.text || "{}";
  let json: Omit<DiaryResult, "emoji"> & { emojiCandidates?: unknown };
  try {
    json = JSON.parse(responseText) as Omit<DiaryResult, "emoji"> & {
      emojiCandidates?: unknown;
    };
  } catch (error) {
    console.error(
      "[ERROR] Failed to parse Structured Outputs JSON in generateUserDiary:",
      error,
    );
    throw new Error("generateUserDiary returned invalid JSON", {
      cause: error,
    });
  }
  return {
    diary: json.diary || "",
    title_ja: json.title_ja || "全肯定の旅人",
    title_en: json.title_en || "Affirmative Traveler",
    emoji: selectDiaryEmojis(json.emojiCandidates, options.recentEmojis),
  };
}

/** 既存の日記本文・称号を変えず、その日の具体的な3絵文字だけを再選定する。 */
export async function generateDiaryEmojis(input: {
  date: string;
  text: string;
  titleJa?: string;
  titleEn?: string;
  recentEmojis?: RecentDiaryEmoji[];
}): Promise<string> {
  const response = await generateContentWithRetry({
    feature: "COMMON_USER_DIARY_EMOJI",
    contents: `次の既存日記を読み、その日の絵文字だけを選び直してください。
本文や称号の書き換え・要約は不要です。
${diaryEmojiPromptRules}${recentDiaryEmojiPrompt(input.recentEmojis)}

日付: ${input.date}
日本語の称号: ${input.titleJa || "(なし)"}
英語の称号: ${input.titleEn || "(なし)"}
日記本文:
${input.text}`,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          emojiCandidates: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            minItems: "10",
            maxItems: "10",
            description:
              "日記中の具体的な出来事を表す、異なるUnicode絵文字候補10個。関連度順",
          },
        },
        required: ["emojiCandidates"],
      },
    },
  });

  let json: { emojiCandidates?: unknown };
  try {
    json = JSON.parse(response.text || "{}") as {
      emojiCandidates?: unknown;
    };
  } catch (error) {
    throw new Error("generateDiaryEmojis returned invalid JSON", {
      cause: error,
    });
  }
  return selectDiaryEmojis(json.emojiCandidates, input.recentEmojis);
}
