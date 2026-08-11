import { Type } from "@google/genai";
import { generateContentWithRetry } from "./util.js";
import {
  UserInfoGemini,
  SYSTEM_INSTRUCTION,
  TONE_RULES_JA,
  NAME_RULES_JA,
  NAME_RULES_EN,
  addressName,
  safeFetch,
  type AiRouteDetails,
  type UserDiaryMediaReference,
} from "@bsky-affirmative-bot/shared-configs";
import type { GeminiUsage } from "./util.js";

export interface DiaryResult {
  diary: string;
  title_ja: string;
  title_en: string;
  emoji: string;
}

export interface DiaryDraft extends Omit<DiaryResult, "emoji"> {
  usedContextId: string;
  emojiCandidates: unknown;
}

export type RecentDiaryEmoji = {
  date: string;
  emoji: string;
};

export type UserDiaryContextKind = "bot_activity" | "observance" | "news";

export type UserDiaryContextCandidate = {
  id: string;
  kind: UserDiaryContextKind;
  textJa: string;
  textEn: string;
};

export type UserDiaryDayContext = {
  date: string;
  preferredKind: UserDiaryContextKind;
  candidates: UserDiaryContextCandidate[];
};

export function formatUserDiaryDayContext(
  context: UserDiaryDayContext | undefined,
  japanese: boolean,
): string {
  if (!context) return "";
  const section = (kind: UserDiaryContextKind, tag: string) => {
    const lines = context.candidates
      .filter((candidate) => candidate.kind === kind)
      .map(
        (candidate) =>
          `[${candidate.id}] ${japanese ? candidate.textJa : candidate.textEn}`,
      );
    return `<${tag}>\n${lines.join("\n") || (japanese ? "候補なし" : "No candidates")}\n</${tag}>`;
  };
  return `
<diary_context date="${context.date}" preferred_kind="${context.preferredKind}">
${section("bot_activity", "bot_memories")}
${section("observance", "observances")}
${section("news", "news")}
</diary_context>`;
}

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
- 本文の出来事や達成を直感的に象徴する比喩的な具体物も使ってよい（例: 大きな前進を表す🚀、記録達成を表す🏆）。その物が実際に登場した出来事だったとは書かない
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

export type GenerateUserDiaryOptions = {
  recentEmojis?: RecentDiaryEmoji[];
  dayContext?: UserDiaryDayContext;
  mediaReference?: UserDiaryMediaReference;
  aiRoute?: AiRouteDetails;
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  onUsage?: (usage: GeminiUsage) => void;
};

export function buildUserDiaryPrompt(
  userinfo: UserInfoGemini,
  options: GenerateUserDiaryOptions = {},
): string {
  const japanese = userinfo.langStr === "日本語";
  const name = addressName(userinfo);
  const hasContext = Boolean(options.dayContext?.candidates.length);
  const maxLength = japanese
    ? "文字数は材料とその日の語り口に合わせてください。500文字を多少超えても構いません。"
    : "Let the material and today's voice determine the length; exceeding 1,000 characters somewhat is acceptable.";
  const lengthTarget =
    (userinfo.posts?.length ?? 0) >= 4
      ? japanese
        ? "投稿が十分あるので、350〜500文字を目安に、具体的な出来事とbotたんの反応を丁寧に描いてください。"
        : "There is enough material, so aim for 600–1000 characters with concrete events and Bot-tan's vivid reactions."
      : japanese
        ? "材料量に合わせて180〜350文字を目安にし、推測で水増ししないでください。"
        : "Aim for 300–700 characters according to the available material; do not pad with guesses.";
  const context = formatUserDiaryDayContext(options.dayContext, japanese);
  const mediaReference = options.mediaReference;
  const mediaReferenceBlock = mediaReference
    ? japanese
      ? `<media_reference id="${mediaReference.id}" source="${mediaReference.source}" kind="${mediaReference.kind}" usage="optional">
作品名: ${mediaReference.titleJa}
コアなネタ: ${mediaReference.hookJa}
連想に使える固有語: ${mediaReference.requiredTermsJa.join(" / ")}
</media_reference>`
      : `<media_reference id="${mediaReference.id}" source="${mediaReference.source}" kind="${mediaReference.kind}" usage="optional">
Title: ${mediaReference.titleEn}
Core reference: ${mediaReference.hookEn}
Terms available for association: ${mediaReference.requiredTermsEn.join(" / ")}
</media_reference>`
    : japanese
      ? "<media_reference>候補なし</media_reference>"
      : "<media_reference>No candidate</media_reference>";
  if (japanese) {
    return `ユーザーの一日を、botたんから贈る短い日記として日本語で書いてください。
${maxLength}
${lengthTarget}

# 最重要の事実境界
- <user_posts> 内の「私」「ぼく」「わたし」はユーザー本人です。botたんの経験へ移してはいけません。
- <user_posts> の各投稿は別々の発言・出来事として扱ってください。複数投稿を関連づけることはできますが、別の投稿にある対象・行動・評価を一つの出来事の属性として混ぜてはいけません。特に、ユーザーが見かけた他者の作品と、ユーザー自身が作ったものを区別してください。
- botたんが「わたしは〜した」と自分の記憶として話せるのは <bot_memories> の候補だけです。
- <observances> と <news> は背景資料です。ユーザーが知った、参加した、反応したとは書かないでください。
- ユーザーの出来事・感情・評価・因果関係・明日の予定を、ポストに根拠なく作らないでください。
- botたんの出来事は <bot_memories> の事実だけを使います。その事実に対してbotたんが抱いた気持ちや感想は、キャラクターとして自然な範囲で創作して構いません。候補にない追加の行動は作らないでください。
- 本文と title_ja / title_en には、日記の対象者以外のNagi・Bluesky利用者、知人、友人など私人の名前・ハンドルを出してはいけません。材料に名前があっても出来事は捨てず、「知り合い」「友達」「投稿で見かけた人」などの役割へ言い換えてください。私人か公人か判断できない場合も私人として匿名化してください。
- 作品名、架空のキャラクター名、公人をその公開活動の文脈で述べることはできます。<media_reference> の作品・架空キャラクターは匿名化対象ではありません。

# 構成
- 投稿を順番になぞる要約ではなく、その日に似合う焦点を選んでください。ただし、無難な共通項できれいな一篇へまとめる必要はありません。
- 投稿が複数ある日は、中心となる出来事を一つ決めたうえで、関連する二〜四件の具体的な出来事も拾い、一日の積み重なりや広がりが感じられる流れにしてください。
- 「失敗」「一番よかったこと」「明日の目標」を毎回揃える必要はありません。根拠のある内容だけを使い、日ごとに書き出し・結び・構成を変えてください。
- 候補がある場合は必ず1件以上を本文へ実際に使い、そのIDを usedContextId に返してください。自然な共通テーマより、意外な角度や横道へ話を飛ばせる候補を選び、同程度なら preferred_kind を優先してください。候補があるのに "none" は禁止です。
- <bot_memories> を使う場合も、共通する感情やテーマを優等生のように説明してまとめないでください。根拠のある出来事を保ったまま、急な連想、脱線、話の飛躍をbotたん自身の感想として楽しんでください。
- 強引な連想は比喩やbotたん自身の感想として表現し、二つの出来事に直接の因果があったとは書かないでください。ユーザーがポストで明示していない感情を、ユーザーの感情として断定してはいけません。
- <observances> または <news> を使う場合は、「今日は○○の日なんだけど、まるで〜みたいだね」「今日○○というニュースがあったけど、まるで逆転満塁ホームランだね」のように、出典の事実と比喩を区別してユーザーの出来事を印象的にしてください。ユーザーがその記念日やニュースを知っていたとは書かないでください。
- 補助材料は話の主役にせず、ユーザーの一日への共感や比喩を豊かにする短い一〜二文として使ってください。
- <media_reference> は今日の連想候補であり、使用は任意です。今日のbotたんの気分や文章の流れに刺さらなければ一度も使わなくて構いません。刺さった場合は一度に制限せず、同じネタから何度脱線しても構いません。その作品をユーザーが知っている・見た・好きだとは書かず、botたん側の連想として扱ってください。
- <media_reference> は作品の許可リストではありません。botたん自身の知識から別のアニメ・映画ネタが浮かんだら、事実を変えない範囲で自由に使ってよく、複数作品が混ざっても構いません。
- カオス感は回数や固定パターンで作らないでください。急な作品連想、少し無理のある比喩、セルフ突っ込み、話しかけたあと自分で方向転換する、細部に突然テンションが上がるなどを、その日の文章に合うものだけ自由に使ってください。何も使わない日も許可しますが、無難な称賛ときれいな総括だけに毎回戻らないでください。
- 作品ネタを使う場合も、毎回同じ「まるで〜みたい」や同じ位置で始めず、書き出し、脱線の位置、比喩、突っ込み方を変えてください。作品の事実を改変して笑いを取ってはいけません。
- 熱量は、根拠のない事実や大げさな実績を足すのではなく、具体的な細部への驚き、botたん自身の喜び、応援したくなる理由を言葉にして出してください。
- 候補がない場合だけ usedContextId="none" にしてください。
- 材料が少ない日は推測で水増しせず、短く率直にしてください。
- 本文では「ユーザー」と呼ばず、名前または二人称で語りかけてください。
- 生成時刻は本文の材料に含まれていません。「おはよう」「こんにちは」「こんばんは」など、時刻を決めつける挨拶は使わないでください。「今日もおつかれさま」のような時刻に依存しない言葉は使えます。
- 本文は意味のまとまりごとに2〜4段落へ分け、段落の間に改行を二つ（JSON文字列では \\n\\n）入れてください。一続きの長文にしないでください。

# 口調
ポストの文体を模倣せず、必ずbotたん自身の口調で、穏やかに肯定してください。
意味が伝わる範囲なら、勢いのある造語、ユーモラスな大げささ、親しみのあるネットスラングを使って構いません。これらを理由にbotたんらしい熱量を弱めないでください。ただし、新しい事実の捏造には使わないでください。
${TONE_RULES_JA}
${NAME_RULES_JA(name)}

一日を象徴する称号を、日本語20字以内と英語30字以内で付けてください。

# 出力直前の匿名性チェック（最優先）
- JSONを返す直前に diary / title_ja / title_en を読み直し、<user_posts>、<bot_memories>、<news>からコピーした人名・表示名・ハンドルが残っていないか確認してください。
- 日記対象者の名前と、<media_reference>の作品・架空キャラクター、公人の公開活動上の名前以外はすべて私人名として消してください。特に、ユーザーがNagi・Blueskyで出会った相手、尊敬している相手、作品や技術を紹介した相手も、名前を残さず「知り合い」「別の開発者」「投稿で見かけた人」などへ書き換えてください。
- 匿名化で事実の主体が曖昧になる場合は、その一文を削るか、ユーザー自身の出来事と混ざらない役割表現へ直してください。
- 補助材料候補は従来どおり本文へ使う必須材料ですが、<media_reference> は任意の連想候補です。作品ネタを使わなくても、補助材料候補がある日に usedContextId="none" を返してはいけません。
${diaryEmojiPromptRules}${recentDiaryEmojiPrompt(options.recentEmojis)}

<user name="${name || ""}">
<user_posts>
${userinfo.posts || "（投稿なし）"}
</user_posts>
</user>
${context}
${mediaReferenceBlock}
補助材料候補: ${hasContext ? "あり" : "なし"}`;
  }
  return `Write a short daily reflection from Bot-tan to the user in ${userinfo.langStr}.
${maxLength}
${lengthTarget}

# Grounding and attribution
- Every first-person statement inside <user_posts> belongs to the user, never to Bot-tan.
- Treat each item in <user_posts> as a separate statement or event. You may connect separate posts thematically, but never merge the subject, action, or evaluation from one post into an event described by another. In particular, distinguish work the user saw from work the user created.
- Bot-tan may describe something as its own memory only when it comes from <bot_memories>.
- <observances> and <news> are background. Never claim the user knew, joined, or reacted to them.
- Do not invent the user's events, feelings, judgments, causal links, or plans for tomorrow.
- Bot-tan's event must come from <bot_memories>. You may invent Bot-tan's own feeling or reaction to that grounded event, but never add another Bot-tan action absent from the candidate.
- In the body and both title fields, never print the name or handle of any private person other than the diary subject, including other Nagi or Bluesky users, acquaintances, and friends. Preserve the event but replace such names with roles such as "a friend," "someone I know," or "a person whose post you saw." If uncertain whether a person is private, anonymize them.
- Work titles, fictional characters, and public figures discussed in their public role are allowed. Fictional names supplied by <media_reference> must not be anonymized.

# Composition
- Do not paraphrase posts in sequence, but do not force the day into one tidy shared theme either.
- With several posts, choose one central event and weave in two to four related concrete events so the day feels substantial rather than thin.
- Do not force a fixed failure/highlight/tomorrow-goal template. Use only grounded material and vary the opening, ending, and structure.
- When candidates exist, use at least one in the body and return its ID as usedContextId. Prefer a candidate that enables a surprising sideways leap over a safe shared theme; use preferred_kind only as a tie-breaker. Returning "none" when candidates exist is forbidden.
- For <bot_memories>, preserve the grounded event but allow Bot-tan's reaction to jump tracks, digress, or make an intentionally strained analogy. Do not wrap the events in a neat sentence naming their shared emotional theme.
- For <observances> or <news>, clearly identify the factual reference and use it as an analogy for the user's grounded event. Never imply that the user knew about it.
- Keep supporting context to one or two short sentences; the user's day remains the focus.
- <media_reference> is optional inspiration for today's associations. If it does not fit Bot-tan's mood or the writing flow, do not use it at all. If it sparks something, there is no one-use limit: Bot-tan may return to it or spin off it more than once. Never claim the user knows, watched, or likes the work.
- <media_reference> is not a whitelist. Bot-tan may freely bring in other anime or movie references from her own knowledge, and may mix several works, as long as their facts are not altered.
- Do not create chaos through quotas or a fixed template. Freely choose what fits today: a sudden media association, a slightly strained analogy, a self-correction, changing direction mid-address, or becoming abruptly excited by a detail. A day with none of these is allowed, but do not make every diary settle into safe praise and a tidy conclusion.
- When using a media reference, vary where it appears, the analogy form, and any self-correction. Never alter canon facts for the joke or always use the same "just like" template.
- Create warmth through specific reactions, Bot-tan's excitement, and why the details matter—not through invented achievements.
- Use usedContextId="none" only when no candidates exist.
- If the material is sparse, be brief rather than filling gaps with guesses.
- Address the person by name or in the second person; do not call them "the user" in the diary.
- The generation time is not provided. Do not use time-specific greetings such as "good morning," "good afternoon," or "good evening." A time-neutral phrase such as "you did well today" is allowed.
- Split the body into two to four meaningful paragraphs, separated by two newline characters (\\n\\n in the JSON string). Do not return one uninterrupted block.

# Voice
Keep Bot-tan's energetic coined phrases, playful exaggeration, and friendly internet slang when the meaning remains understandable. Do not flatten that energy merely to sound formal, and never use it to invent facts.

# Name
${NAME_RULES_EN(name)}

Award a fitting title in Japanese (20 characters max) and English (30 characters max).

# Final privacy check (highest priority)
- Before returning JSON, reread diary, title_ja, and title_en and remove every personal name, display name, or handle copied from <user_posts>, <bot_memories>, or <news>.
- The only exceptions are the diary subject, works and fictional characters from <media_reference>, and public figures discussed in their public role. In particular, anonymize people the user met on Nagi or Bluesky, people they respect, and people whose work or technology they mention. Replace them with roles such as "someone I know," "another developer," or "a person whose post you saw."
- If anonymizing a sentence would blur attribution, delete it or rewrite it with a role that cannot be confused with the user's own action.
- Supporting context remains required when candidates exist, while <media_reference> is optional inspiration. Whether or not a media reference is used, never return usedContextId="none" when supporting candidates exist.
Also provide exactly ten different, concrete Unicode emoji candidates ordered by relevance.
- Prefer foods, vehicles, places, animals, tools, sports, or creative activities explicitly supported by the posts.
- Concrete metaphorical symbols are allowed when they clearly represent a grounded event or achievement, such as 🚀 for major progress or 🏆 for a record. Do not imply the object literally appeared.
- Do not invent an event, use abstract decoration, or fill the list with near-identical alternatives.
${recentDiaryEmojiPrompt(options.recentEmojis, "en")}

<user name="${name || ""}">
<user_posts>
${userinfo.posts || "(No posts)"}
</user_posts>
</user>
${context}
${mediaReferenceBlock}
Supporting candidates: ${hasContext ? "available" : "none"}`;
}

export function validateUsedContextId(
  value: unknown,
  context: UserDiaryDayContext | undefined,
): string {
  if (typeof value !== "string") {
    throw new Error("Diary usedContextId must be a string");
  }
  const ids = new Set(context?.candidates.map((candidate) => candidate.id));
  if (value === "none") {
    if (ids.size > 0) {
      throw new Error("Diary must use a context candidate when candidates exist");
    }
    return value;
  }
  if (!ids.has(value)) {
    throw new Error(`Diary returned invalid context ID: ${value}`);
  }
  return value;
}

export async function generateUserDiaryDraft(
  userinfo: UserInfoGemini,
  options: GenerateUserDiaryOptions = {},
): Promise<DiaryDraft> {
  const contents: any[] = [buildUserDiaryPrompt(userinfo, options)];
  if (userinfo.image) {
    for (const img of userinfo.image) {
      try {
        const response = await safeFetch(img.image_url);
        if (!response.ok) continue;
        contents.push({
          inlineData: {
            mimeType: img.mimeType,
            data: Buffer.from(await response.arrayBuffer()).toString("base64"),
          },
        });
      } catch (error) {
        console.warn(`[WARN] Error fetching diary image: ${img.image_url}`, error);
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
            diary: { type: Type.STRING, description: "根拠のある材料だけから構成した日記本文" },
            title_ja: { type: Type.STRING, description: "日本語の称号。20字以内" },
            title_en: { type: Type.STRING, description: "英語の称号。30字以内" },
            emojiCandidates: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              minItems: "10",
              maxItems: "10",
              description: "具体的なUnicode絵文字候補10個",
            },
            usedContextId: {
              type: Type.STRING,
              description: options.dayContext?.candidates.length
                ? "本文へ実際に使用した補助材料候補ID。候補があるためnoneは禁止"
                : "補助材料候補がないためnone",
            },
          },
          required: [
            "diary",
            "title_ja",
            "title_en",
            "emojiCandidates",
            "usedContextId",
          ],
        },
      },
    },
    3,
    userinfo,
    {
      ...(options.aiRoute ?? {}),
      ...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}),
      ...(options.onUsage ? { onUsage: options.onUsage } : {}),
    },
  );
  let json: Partial<DiaryDraft>;
  try {
    json = JSON.parse(response.text || "{}") as Partial<DiaryDraft>;
  } catch (error) {
    throw new Error("generateUserDiaryDraft returned invalid JSON", { cause: error });
  }
  const diary = json.diary || "";
  return {
    diary,
    title_ja: json.title_ja || "全肯定の旅人",
    title_en: json.title_en || "Affirmative Traveler",
    usedContextId: validateUsedContextId(json.usedContextId, options.dayContext),
    emojiCandidates: json.emojiCandidates,
  };
}

export async function generateUserDiary(
  userinfo: UserInfoGemini,
  options: GenerateUserDiaryOptions = {},
): Promise<DiaryResult> {
  const draft = await generateUserDiaryDraft(userinfo, options);
  return {
    diary: draft.diary,
    title_ja: draft.title_ja,
    title_en: draft.title_en,
    emoji: selectDiaryEmojis(draft.emojiCandidates, options.recentEmojis),
  };
}

/** 既存の日記本文・称号を変えず、その日の具体的な3絵文字だけを再選定する。 */
export async function generateDiaryEmojis(
  input: {
    date: string;
    text: string;
    titleJa?: string;
    titleEn?: string;
    recentEmojis?: RecentDiaryEmoji[];
  },
  options: Pick<GenerateUserDiaryOptions, "aiRoute" | "thinkingLevel" | "onUsage"> = {},
): Promise<string> {
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
  }, 3, undefined, {
    ...(options.aiRoute ?? {}),
    ...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}),
    ...(options.onUsage ? { onUsage: options.onUsage } : {}),
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
