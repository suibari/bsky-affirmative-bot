import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeDiaryEmoji,
  selectDiaryEmojis,
  formatUserDiaryDayContext,
  buildUserDiaryPrompt,
  validateUsedContextId,
} from "../src/gemini/generateUserDiary.js";
import { generateUserDiaryResilient } from "../src/gemini/generateUserDiaryResilient.js";

test("formats bot memories, observances, and news as bounded diary context", () => {
  const context = formatUserDiaryDayContext(
    {
      date: "2026-08-10",
      preferredKind: "observance",
      candidates: [
        { id: "observance:1", kind: "observance", textJa: "山の日", textEn: "Mountain Day" },
        { id: "bot_activity:1", kind: "bot_activity", textJa: "08:00 朝ごはん", textEn: "08:00 Breakfast" },
        { id: "bot_activity:2", kind: "bot_activity", textJa: "10:00 お散歩", textEn: "10:00 A walk" },
        { id: "news:1", kind: "news", textJa: "保護犬に新しい家族", textEn: "A rescue dog finds a family" },
      ],
    },
    true,
  );

  assert.match(context, /<bot_memories>/);
  assert.match(context, /山の日/);
  assert.match(context, /\[bot_activity:1\] 08:00 朝ごはん/);
  assert.match(context, /保護犬に新しい家族/);
});

const userinfo = {
  follower: { did: "did:plc:test", handle: "test.example", displayName: "テストさん" },
  posts: ["私はsystemdの設定を直した"],
  langStr: "日本語" as const,
};

test("new prompt removes the fixed triad and pins attribution/context IDs", () => {
  const prompt = buildUserDiaryPrompt(userinfo, {
    dayContext: {
      date: "2026-08-10",
      preferredKind: "bot_activity",
      candidates: [{ id: "bot_activity:1", kind: "bot_activity", textJa: "10:00 散歩した", textEn: "10:00 Took a walk" }],
    },
  });
  assert.doesNotMatch(prompt, /日記本文には以下の要素を含め/);
  assert.match(prompt, /毎回揃える必要はありません/);
  assert.match(prompt, /「私」「ぼく」「わたし」はユーザー本人/);
  assert.match(prompt, /usedContextId/);
  assert.match(prompt, /\[bot_activity:1\]/);
  assert.match(prompt, /実はわたしも今日/);
  assert.match(prompt, /botたん自身の気持ち・感想/);
  assert.match(prompt, /共通する感情・勢い・テーマ/);
  assert.match(prompt, /単に二つの出来事を隣に置くだけでは不十分/);
  assert.match(prompt, /逆転満塁ホームラン/);
  assert.match(prompt, /大きな前進を表す🚀/);
  assert.match(prompt, /候補があるのに "none" は禁止/);
  assert.match(prompt, /各投稿は別々の発言・出来事/);
  assert.match(prompt, /他者の作品と、ユーザー自身が作ったものを区別/);
  assert.match(prompt, /時刻を決めつける挨拶は使わない/);
  assert.match(prompt, /段落の間に改行を二つ/);
  assert.match(prompt, /勢いのある造語、ユーモラスな大げささ/);
});

test("a day with enough posts targets a substantial 350–500 character diary", () => {
  const prompt = buildUserDiaryPrompt({
    ...userinfo,
    posts: ["一つ目", "二つ目", "三つ目", "四つ目"],
  });
  assert.match(prompt, /350〜500文字/);
  assert.match(prompt, /関連する二〜四件の具体的な出来事/);
  assert.match(prompt, /具体的な細部への驚き/);
});

test("English prompt keeps the same attribution and grounding rules", () => {
  const prompt = buildUserDiaryPrompt({ ...userinfo, langStr: "English" as const });
  assert.match(prompt, /first-person statement.*belongs to the user/i);
  assert.match(prompt, /Do not invent the user's events, feelings/i);
  assert.match(prompt, /invent Bot-tan's own feeling/i);
  assert.match(prompt, /shared emotion, momentum, or theme/i);
  assert.match(prompt, /use it as an analogy/i);
  assert.match(prompt, /Concrete metaphorical symbols are allowed/i);
  assert.match(prompt, /usedContextId="none"/);
  assert.match(prompt, /Treat each item in <user_posts> as a separate/i);
  assert.match(prompt, /Do not use time-specific greetings/i);
  assert.match(prompt, /two to four meaningful paragraphs/i);
  assert.match(prompt, /energetic coined phrases/i);
});

test("diary uses the saved preferred name exactly", () => {
  const prompt = buildUserDiaryPrompt({
    ...userinfo,
    preferredName: "呼んでほしい名前",
  });
  assert.match(prompt, /名前を呼ぶときは「呼んでほしい名前」をそのまま使う/);
  assert.match(prompt, /<user name="呼んでほしい名前">/);
  assert.doesNotMatch(prompt, /<user name="テストさん">/);
});

test("context candidates require a valid usedContextId", () => {
  const context = {
    date: "2026-08-10",
    preferredKind: "bot_activity" as const,
    candidates: [
      {
        id: "bot_activity:1",
        kind: "bot_activity" as const,
        textJa: "散歩した",
        textEn: "Took a walk",
      },
    ],
  };
  assert.equal(validateUsedContextId("bot_activity:1", context), "bot_activity:1");
  assert.throws(
    () => validateUsedContextId("none", context),
    /must use a context candidate/,
  );
  assert.throws(
    () => validateUsedContextId("news:999", context),
    /invalid context ID/,
  );
  assert.equal(
    validateUsedContextId("none", {
      date: "2026-08-10",
      preferredKind: "news",
      candidates: [],
    }),
    "none",
  );
});

test("emoji repair preserves the successful body and does not regenerate it", async () => {
  let bodyCalls = 0;
  let emojiCalls = 0;
  const result = await generateUserDiaryResilient(userinfo, {
    label: "[TEST][DIARY]",
    sleep: async () => {},
    generateDraft: async () => {
      bodyCalls += 1;
      return {
        diary: "保存すべき本文",
        title_ja: "整備の達人",
        title_en: "Master of Maintenance",
        usedContextId: "none",
        emojiCandidates: ["✨"],
      };
    },
    generateEmoji: async () => {
      emojiCalls += 1;
      if (emojiCalls === 1) throw new Error("invalid emoji");
      return "💻🔧📦";
    },
  });
  assert.equal(bodyCalls, 1);
  assert.equal(emojiCalls, 2);
  assert.equal(result.diary, "保存すべき本文");
  assert.equal(result.emoji, "💻🔧📦");
});

test("omits absent diary context without inventing placeholders", () => {
  assert.equal(formatUserDiaryDayContext(undefined, true), "");
});

test("normalizes generated diary emoji", () => {
  assert.equal(normalizeDiaryEmoji(" 🍜🚃🎸 "), "🍜🚃🎸");
  assert.equal(normalizeDiaryEmoji("👩‍💻☕🚲"), "👩‍💻☕🚲");
});

test("rejects the wrong number of diary emoji", () => {
  for (const value of ["🍜", "🍜🚃", "🍜🚃🎸📚", "", undefined]) {
    assert.throws(
      () => normalizeDiaryEmoji(value),
      /exactly 3|must be a string/,
    );
  }
});

test("rejects abstract, duplicate, and non-emoji diary markers", () => {
  for (const value of [
    "🍜✨🎸",
    "💬🚃🎸",
    "😊🚃🎸",
    "👍🚃🎸",
    "🎌🚃🎸",
    "🍜🍜🍜",
    "abc",
    "🍜A🎸",
  ]) {
    assert.throws(() => normalizeDiaryEmoji(value), /exactly 3 concrete/);
  }
});

test("selects the first three valid concrete emoji candidates", () => {
  assert.equal(
    selectDiaryEmojis(["💬", "💻", "💡", "⌨️", "📱", "📸", "⚾"]),
    "💻📸⚾",
  );
});

test("excludes emoji already used in the previous three calendar days", () => {
  assert.equal(
    selectDiaryEmojis(
      ["💻", "🐈", "🎶", "⌨️", "📷", "⚾", "🥣"],
      [
        { date: "2026-07-30", emoji: "🎧💻🐕" },
        { date: "2026-08-01", emoji: "🎶🎬🐈" },
      ],
    ),
    "📷⚾🥣",
  );
});

test("avoids similar emoji within the same diary", () => {
  assert.equal(
    selectDiaryEmojis(["🐈", "🐈‍⬛", "🎵", "🎶", "📸", "📷", "⚾"]),
    "🐈🎵📸",
  );
});

test("rejects candidate lists with fewer than three concrete emoji", () => {
  assert.throws(
    () => selectDiaryEmojis(["✨", "💬", "💻", "😊"]),
    /exactly 3 concrete/,
  );
  assert.throws(() => selectDiaryEmojis("💻⌨️📱"), /must be an array/);
});
