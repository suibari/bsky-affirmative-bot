import assert from "node:assert/strict";
import test from "node:test";
import {
  filterRelatedHistory,
  generateEmbedding,
  generateEmbeddings,
} from "../src/ollamaEmbed.js";

const original = {
  baseUrl: process.env.OLLAMA_BASE_URL,
  embedBaseUrl: process.env.OLLAMA_EMBED_BASE_URL,
  timeoutMs: process.env.OLLAMA_EMBED_TIMEOUT_MS,
  cooldownMs: process.env.OLLAMA_EMBED_COOLDOWN_MS,
  fetch: globalThis.fetch,
  now: Date.now,
};

const restore = () => {
  if (original.baseUrl === undefined) delete process.env.OLLAMA_BASE_URL;
  else process.env.OLLAMA_BASE_URL = original.baseUrl;
  if (original.embedBaseUrl === undefined) delete process.env.OLLAMA_EMBED_BASE_URL;
  else process.env.OLLAMA_EMBED_BASE_URL = original.embedBaseUrl;
  if (original.timeoutMs === undefined)
    delete process.env.OLLAMA_EMBED_TIMEOUT_MS;
  else process.env.OLLAMA_EMBED_TIMEOUT_MS = original.timeoutMs;
  if (original.cooldownMs === undefined)
    delete process.env.OLLAMA_EMBED_COOLDOWN_MS;
  else process.env.OLLAMA_EMBED_COOLDOWN_MS = original.cooldownMs;
  globalThis.fetch = original.fetch;
  Date.now = original.now;
};

test("Ollama embedding timeout opens a circuit and recovers after cooldown", async () => {
  process.env.OLLAMA_BASE_URL = "http://ollama.test/v1";
  delete process.env.OLLAMA_EMBED_BASE_URL;
  process.env.OLLAMA_EMBED_TIMEOUT_MS = "10";
  process.env.OLLAMA_EMBED_COOLDOWN_MS = "1000";
  let now = 1_000;
  Date.now = () => now;
  let calls = 0;

  globalThis.fetch = ((_url, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      // AbortSignal.timeout() の内部タイマーは unref されるため、テストプロセスを
      // abort まで生かす通常タイマーも置く。
      const guard = setTimeout(() => reject(new Error("abort did not fire")), 100);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(guard);
        reject(init.signal?.reason);
      });
    });
  }) as typeof fetch;

  try {
    assert.equal(await generateEmbedding("timeout"), null);
    assert.equal(calls, 1);

    assert.deepEqual(await generateEmbeddings(["circuit", "open"]), [null, null]);
    assert.equal(calls, 1, "cooldown中はOllamaを再呼び出さない");

    now += 1_001;
    const vector = Array.from({ length: 1024 }, () => 0.5);
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ data: [{ embedding: vector }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    assert.deepEqual(await generateEmbedding("recovered"), vector);
    assert.equal(calls, 2);
  } finally {
    restore();
  }
});

test("related-history fallback can reject unrelated candidates", async () => {
  delete process.env.OLLAMA_BASE_URL;
  try {
    const candidates = ["newest unrelated", "older unrelated"];
    assert.deepEqual(
      await filterRelatedHistory("query", candidates, 1, 0.6, "head"),
      ["newest unrelated"],
    );
    assert.deepEqual(
      await filterRelatedHistory("query", candidates, 1, 0.6, "empty"),
      [],
    );
  } finally {
    restore();
  }
});
