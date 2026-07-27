import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.NAGI_BOT_DID ??= "did:plc:testbot";

const {
  hasTranslationText,
  MAX_TRANSLATION_BATCH_SIZE,
  requestTranslationWithRetry,
  SingleFlight,
  TRANSLATION_CACHE_VERSION,
  TranslationMissQuota,
  translatePosts,
  translationPrompt,
} = await import("../src/services/translation.js");

const validUri = "at://did:plc:example/com.suibari.nagi.post/3mtranslation";
const english = { code: "en", name: "English" } as any;
const successResponse = (text = "Translated text") =>
  new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

test("rejects only empty translation output and leaves content judgment to the model", () => {
  assert.equal(hasTranslationText(""), false);
  assert.equal(hasTranslationText(" \n\t"), false);
  assert.equal(hasTranslationText("Excellent work!"), true);
  assert.equal(hasTranslationText("x".repeat(100_000)), true);
});

test("uses the TranslateGemma source/target prompt and preserves two blank lines", () => {
  const prompt = translationPrompt(
    { code: "ja", name: "日本語" } as any,
    { code: "en", name: "English" } as any,
    "こんにちは",
  );
  assert.match(prompt, /日本語 \(ja\) to English \(en\) translator/);
  assert.ok(prompt.endsWith("English:\n\n\nこんにちは"));
});

test("cache hits consume no miss quota and the fixed window resets", () => {
  let now = 1_000;
  const quota = new TranslationMissQuota(2, 60_000, () => now);
  assert.equal(quota.take("client", 0), true);
  assert.equal(quota.take("client", 2), true);
  assert.equal(quota.take("client", 1), false);
  now += 60_000;
  assert.equal(quota.take("client", 1), true);
});

test("single-flight shares one task and removes failed requests for retry", async () => {
  const requests = new SingleFlight<string>();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = requests.run("same", async () => {
    calls += 1;
    await gate;
    return "translated";
  });
  const second = requests.run("same", async () => {
    calls += 1;
    return "duplicate";
  });
  assert.equal(first, second);
  release();
  assert.deepEqual(await Promise.all([first, second]), [
    "translated",
    "translated",
  ]);
  assert.equal(calls, 1);

  await assert.rejects(
    requests.run("retry", async () => {
      throw new Error("temporary");
    }),
  );
  assert.equal(
    await requests.run("retry", async () => "recovered"),
    "recovered",
  );
});

test("retries once after a timeout without holding the retry delay", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const result = await requestTranslationWithRetry("prompt", english, {
    fetcher: async () => {
      calls += 1;
      if (calls === 1) throw new DOMException("timed out", "TimeoutError");
      return successResponse();
    },
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
    log: () => undefined,
  });
  assert.equal(result, "Translated text");
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [1_000]);
});

test("retries once after a server error and succeeds", async () => {
  let calls = 0;
  const result = await requestTranslationWithRetry("prompt", english, {
    fetcher: async () => {
      calls += 1;
      return calls === 1
        ? new Response("", { status: 503 })
        : successResponse();
    },
    sleep: async () => undefined,
    log: () => undefined,
  });
  assert.equal(result, "Translated text");
  assert.equal(calls, 2);
});

test("retries once after an empty response and succeeds", async () => {
  let calls = 0;
  const result = await requestTranslationWithRetry("prompt", english, {
    fetcher: async () => {
      calls += 1;
      return successResponse(calls === 1 ? " \n" : "Translated text");
    },
    sleep: async () => undefined,
    log: () => undefined,
  });
  assert.equal(result, "Translated text");
  assert.equal(calls, 2);
});

test("returns failure after two temporary upstream errors", async () => {
  let calls = 0;
  await assert.rejects(
    requestTranslationWithRetry("prompt", english, {
      fetcher: async () => {
        calls += 1;
        return new Response("", { status: 503 });
      },
      sleep: async () => undefined,
      log: () => undefined,
    }),
    (error: any) =>
      error.code === "upstream_unavailable" && error.reason === "http_503",
  );
  assert.equal(calls, 2);
});

test("does not retry a client error", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  await assert.rejects(
    requestTranslationWithRetry("prompt", english, {
      fetcher: async () => {
        calls += 1;
        return new Response("", { status: 400 });
      },
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      log: () => undefined,
    }),
    (error: any) =>
      error.code === "upstream_unavailable" && error.reason === "http_400",
  );
  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
});

test("validates batch size, URI, and target language before database access", async () => {
  await assert.rejects(
    translatePosts(
      Array(MAX_TRANSLATION_BATCH_SIZE + 1).fill(validUri),
      "en",
      "client",
    ),
    (error: any) => error.status === 400 && error.error === "invalid_request",
  );
  await assert.rejects(
    translatePosts(["https://example.com/post"], "en", "client"),
    (error: any) => error.status === 400 && error.error === "invalid_request",
  );
  await assert.rejects(
    translatePosts([validUri], "xx-invalid", "client"),
    (error: any) => error.status === 400 && error.error === "invalid_request",
  );
});

test("new translation cache generation is version 3", () => {
  assert.equal(TRANSLATION_CACHE_VERSION, 3);
});
