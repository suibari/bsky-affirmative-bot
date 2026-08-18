import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createGuestAffirmationReply } from "../src/guestAffirmationReply.js";

const worker = await readFile(
  new URL("../src/GuestAffirmationWorker.ts", import.meta.url),
  "utf8",
);

test("guest reply completion erases the transient input and never publishes a post", () => {
  assert.match(worker, /state: "posted",[\s\S]{0,100}reply,[\s\S]{0,100}text: ""/);
  assert.doesNotMatch(worker, /publishNagiPost|createKossoriPost|applyMutation/);
});

test("guest worker logs no post body or token", () => {
  const logBlock = worker.slice(worker.indexOf("console.warn"));
  assert.doesNotMatch(logBlock, /job\.text|accessToken/);
});

test("guest reply uses generated affirmation before predefined fallback", async () => {
  let reserved = 0;
  let predefinedCalls = 0;
  const reply = await createGuestAffirmationReply(
    { text: "今日は少し疲れた", language: "ja" },
    {
      reserve: async () => {
        reserved += 1;
      },
      generate: async (userinfo, options) => {
        assert.deepEqual(userinfo.posts, ["今日は少し疲れた"]);
        assert.equal(userinfo.follower.displayName, undefined);
        assert.equal(userinfo.langStr, "日本語");
        await options.beforeRequest?.();
        return { comment: "ここまで歩いてきたこと、ちゃんと伝わってるよ。", score: 50 };
      },
      predefined: async () => {
        predefinedCalls += 1;
        return "定型文";
      },
    },
  );

  assert.equal(reply, "ここまで歩いてきたこと、ちゃんと伝わってるよ。");
  assert.equal(reserved, 1);
  assert.equal(predefinedCalls, 0);
});

test("guest reply uses predefined text only when generation fails", async () => {
  let selectorMode = "";
  let warning = "";
  const reply = await createGuestAffirmationReply(
    { text: "rough day", language: "en" },
    {
      generate: async () => {
        throw new Error("generation unavailable");
      },
      predefined: async (_input, options) => {
        selectorMode = options.selectorMode ?? "";
        return "You made it through today.";
      },
      warn: (message) => {
        warning = message;
      },
    },
  );

  assert.equal(reply, "You made it through today.");
  assert.equal(selectorMode, "random");
  assert.match(warning, /guest_affirmation_template_fallback/);
  assert.doesNotMatch(warning, /rough day/);
});
