import assert from "node:assert/strict";
import test from "node:test";
import { createLiveCommentEnergySync } from "../src/liveCommentEnergySync.js";

const silentLogger = {
  info() {},
  error() {},
};

function managerWithCursor(initialCursor: number | null) {
  let cursor = initialCursor;
  const initialized: number[] = [];
  const applied: Array<{ amount: number; throughCommentId: number }> = [];
  return {
    manager: {
      get getLiveCommentEnergyCursor() { return cursor; },
      async initializeLiveCommentEnergyCursor(commentId: number) {
        cursor = commentId;
        initialized.push(commentId);
      },
      async addLiveCommentEnergy(amount: number, throughCommentId: number) {
        applied.push({ amount, throughCommentId });
        cursor = throughCommentId;
      },
    },
    initialized,
    applied,
  };
}

test("初回は既存コメントを加算せず最大idを基準点にする", async () => {
  const state = managerWithCursor(null);
  const sync = createLiveCommentEnergySync(state.manager, 10, {
    getBatchAfter: async () => ({ count: 21, maxId: 42 }),
    logger: silentLogger,
  });

  await sync.run();

  assert.deepEqual(state.initialized, [42]);
  assert.deepEqual(state.applied, []);
});

test("カーソル以降のコメント件数をまとめて加算する", async () => {
  const state = managerWithCursor(42);
  const seenCursors: number[] = [];
  const sync = createLiveCommentEnergySync(state.manager, 10, {
    getBatchAfter: async (cursor) => {
      seenCursors.push(cursor);
      return { count: 3, maxId: 47 };
    },
    logger: silentLogger,
  });

  await sync.run();

  assert.deepEqual(seenCursors, [42]);
  assert.deepEqual(state.applied, [{ amount: 30, throughCommentId: 47 }]);
});

test("取得失敗時はカーソルを進めず次回に再試行できる", async () => {
  const state = managerWithCursor(42);
  let calls = 0;
  const sync = createLiveCommentEnergySync(state.manager, 10, {
    getBatchAfter: async () => {
      calls++;
      if (calls === 1) throw new Error("temporary DB failure");
      return { count: 1, maxId: 43 };
    },
    logger: silentLogger,
  });

  await sync.run();
  assert.equal(state.manager.getLiveCommentEnergyCursor, 42);
  await sync.run();
  assert.deepEqual(state.applied, [{ amount: 10, throughCommentId: 43 }]);
});

test("ポーリングが重なっても同じ取得処理を共有する", async () => {
  const state = managerWithCursor(42);
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const sync = createLiveCommentEnergySync(state.manager, 10, {
    getBatchAfter: async () => {
      calls++;
      await blocked;
      return { count: 1, maxId: 43 };
    },
    logger: silentLogger,
  });

  const first = sync.run();
  const second = sync.run();
  assert.equal(first, second);
  release();
  await Promise.all([first, second]);

  assert.equal(calls, 1);
  assert.deepEqual(state.applied, [{ amount: 10, throughCommentId: 43 }]);
});
