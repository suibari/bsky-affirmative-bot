import assert from "node:assert/strict";
import test from "node:test";
import { buildWhimsicalPostTexts } from "../src/scheduledPostContent.js";

test("ニュースURLはNagiだけに追加しBluesky本文は変えない", () => {
  const result = buildWhimsicalPostTexts({
    textJa: "うれしいニュースだよ",
    textEn: "Here is some happy news",
    moodSong: "MyMoodSong:\nSong - Artist\nhttps://youtube.example/song",
    selectedNewsUrl: "https://news.example/article",
  });

  assert.equal(
    result.bskyJa,
    "うれしいニュースだよ\n\nMyMoodSong:\nSong - Artist\nhttps://youtube.example/song",
  );
  assert.doesNotMatch(result.bskyJa, /news\.example/);
  assert.match(result.nagiJa, /https:\/\/news\.example\/article/);
  assert.match(result.nagiJa, /https:\/\/youtube\.example\/song/);
  assert.match(result.nagiEn, /https:\/\/news\.example\/article/);
});

test("ニュースが選ばれなければNagi本文にもURLを追加しない", () => {
  const result = buildWhimsicalPostTexts({
    textJa: "今日はのんびりだよ",
    textEn: "Taking it easy today",
    moodSong: "MyMoodSong:\nSong - Artist\n(Not found in Youtube...)",
  });

  assert.equal(result.nagiJa, result.bskyJa);
  assert.equal(result.nagiEn, result.bskyEn);
});
