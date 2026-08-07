import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGoodNightPostTexts,
  buildWhimsicalPostTexts,
  getNagiThreadUrl,
} from "../src/scheduledPostContent.js";

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

test("Nagi選出時は両方のおやすみ本文へスレッドURLを1回追加する", () => {
  const result = buildGoodNightPostTexts({
    textJa: "今日もありがとう。おやすみー！",
    textEn: "Thank you for today. Good night!",
    sourcePost: {
      network: "nagi",
      uri: "at://did:plc:example/com.suibari.nagi.post/3mexample",
    },
  });

  const url = "https://nagi.suibari.com/thread/did%3Aplc%3Aexample/3mexample";
  assert.equal(result.sourceUrl, url);
  assert.equal(result.bsky.match(new RegExp(url, "g"))?.length, 1);
  assert.equal(result.nagiJa.match(new RegExp(url, "g"))?.length, 1);
  assert.doesNotMatch(result.nagiEn, /nagi\.suibari\.com\/thread/);
});

test("Bluesky選出時はおやすみ本文へNagi URLを追加しない", () => {
  const result = buildGoodNightPostTexts({
    textJa: "今日もありがとう。おやすみー！",
    textEn: "Thank you for today. Good night!",
    sourcePost: {
      network: "bsky",
      uri: "at://did:plc:example/app.bsky.feed.post/3mexample",
    },
  });

  assert.equal(result.sourceUrl, undefined);
  assert.equal(
    result.bsky,
    "今日もありがとう。おやすみー！\n\nThank you for today. Good night!",
  );
  assert.equal(result.nagiJa, "今日もありがとう。おやすみー！");
});

test("不正なAT URIからNagiスレッドURLを作らない", () => {
  assert.equal(
    getNagiThreadUrl("at://did:plc:example/app.bsky.feed.post/rkey"),
    undefined,
  );
  assert.equal(getNagiThreadUrl("https://example.com/post"), undefined);
});
