import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeDiaryEmoji,
  selectDiaryEmojis,
} from "../src/gemini/generateUserDiary.js";

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
