import { Jetstream } from "@skyware/jetstream";
import ws from "ws";
import {
  db,
  nagiIngestState,
  reportHealthFailure,
  reportHeartbeat,
} from "@bsky-affirmative-bot/database";
import { NAGI_INGEST_COLLECTIONS } from "@bsky-affirmative-bot/nagi-lexicon";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { withDidLock } from "./didLock.js";
import { processEvent } from "./processEvent.js";
import { prioritizeReconcile, setIngestDegraded } from "./reconcileWorker.js";
import { SerialRetryQueue } from "./serialQueue.js";

/**
 * 同一エンドポイントへの再接続をここまで続けても繋がらなければ、次の候補へ移る。
 * 短い瞬断は @skyware/jetstream 内部の partysocket が勝手に張り直すので、こちらは
 * 「そのインスタンス自体が死んでいる」と判断できるだけの時間を待ってから動く。
 */
const ROTATE_AFTER_MS = 20_000;
/** 切断がこれ以上続いたら、reconcile を短周期に切り替えて PDS 直読みで追従する。 */
const DEGRADED_AFTER_MS = 60_000;

export async function startJetstream() {
  const endpoints = config.jetstreamUrls;
  const queue = new SerialRetryQueue<any>(
    (evt) => withDidLock(String(evt.did ?? ""), () => processEvent(evt)),
    ({ item: evt, error, attempt, delayMs }) => {
      console.error("[ERROR][jetstream] Event processing failed; retrying", {
        did: evt?.did,
        collection: evt?.commit?.collection,
        rkey: evt?.commit?.rkey,
        attempt,
        delayMs,
        error,
      });
    },
  );

  const enqueue = (evt: any) => {
    if (typeof evt?.did === "string") prioritizeReconcile(evt.did);
    queue.enqueue(evt);
  };

  let stream: Jetstream<any, any> | undefined;
  let stopping = false;
  let connected = false;
  let endpointIndex = 0;
  let rotations = 0;
  let rotateTimer: NodeJS.Timeout | undefined;
  let degradedTimer: NodeJS.Timeout | undefined;

  const endpoint = () => endpoints[endpointIndex];

  const reportConnected = () => {
    if (!connected) return;
    reportHeartbeat("jetstream-appview", {
      endpoint: endpoint(),
      rotations,
    }).catch((error) =>
      console.error("[ERROR][APPVIEW][JETSTREAM] Failed to report heartbeat:", error),
    );
  };
  const heartbeat = setInterval(reportConnected, 30_000);
  heartbeat.unref();

  /**
   * 再開位置は接続のたびに DB から読み直す。processEvent / applyMutation が受信のたびに
   * nagi_ingest_state を進めているので、別インスタンスへ乗り換えても続きから拾える。
   * カーソルは unix マイクロ秒の時刻ベースで、公式インスタンス間で共通に使える。
   */
  const loadCursor = async (): Promise<number | undefined> => {
    const saved = await db
      .select()
      .from(nagiIngestState)
      .where(eq(nagiIngestState.key, "jetstream"))
      .limit(1);
    if (!saved[0]) return undefined;
    return Math.max(0, saved[0].cursor - config.jetstreamReplaySeconds * 1_000_000);
  };

  const clearTimers = () => {
    if (rotateTimer) clearTimeout(rotateTimer);
    rotateTimer = undefined;
    if (degradedTimer) clearTimeout(degradedTimer);
    degradedTimer = undefined;
  };

  /** 切断中に走らせるタイマー群。接続できたら open ハンドラが全部畳む。 */
  const armDisconnectTimers = () => {
    if (stopping) return;
    // 候補が1本しかないなら、張り直しても同じ先なので partysocket に任せきる。
    if (!rotateTimer && endpoints.length > 1) {
      rotateTimer = setTimeout(rotate, ROTATE_AFTER_MS);
      rotateTimer.unref();
    }
    if (!degradedTimer) {
      degradedTimer = setTimeout(() => {
        degradedTimer = undefined;
        if (!connected && !stopping) setIngestDegraded(true);
      }, DEGRADED_AFTER_MS);
      degradedTimer.unref();
    }
  };

  const rotate = () => {
    rotateTimer = undefined;
    if (stopping || connected) return;
    endpointIndex = (endpointIndex + 1) % endpoints.length;
    rotations++;
    console.warn("[WARN][jetstream] Rotating endpoint", {
      endpoint: endpoint(),
      rotations,
    });
    // partysocket は close() で再接続を止めるので、旧接続と二重に走らせずに済む。
    const previous = stream;
    stream = undefined;
    previous?.close();
    connect().catch((error) => {
      console.error("[ERROR][jetstream] Failed to connect after rotation", error);
      armDisconnectTimers();
    });
  };

  const onDisconnect = (error: unknown) => {
    connected = false;
    reportHealthFailure("jetstream-appview", error).catch(() => {});
    armDisconnectTimers();
  };

  const connect = async () => {
    if (stopping) return;
    const cursor = await loadCursor();
    if (stopping) return;
    const current = endpoint();
    const started = new Jetstream({
      ws,
      endpoint: current,
      wantedCollections: [...NAGI_INGEST_COLLECTIONS],
      cursor,
    });
    stream = started;

    for (const collection of NAGI_INGEST_COLLECTIONS) {
      started.onCreate(collection, enqueue);
      started.onUpdate(collection, enqueue);
      started.onDelete(collection, enqueue);
    }
    started.on("open", () => {
      // ローテーション後に旧接続の open が遅れて届いても、現行接続の状態を壊さない。
      if (started !== stream) return;
      connected = true;
      clearTimers();
      setIngestDegraded(false);
      console.log("[INFO][jetstream] Connected", { endpoint: current, cursor });
      reportConnected();
    });
    started.on("error", (error) => {
      if (started !== stream) return;
      console.error(error);
      onDisconnect(error);
    });
    started.on("close", () => {
      if (started !== stream || stopping) return;
      onDisconnect(new Error("Jetstream connection closed"));
    });
    started.start();
    // 初回接続が open に至らない場合もローテーションできるよう、ここで先に仕掛けておく。
    armDisconnectTimers();
  };

  await connect();

  return {
    async close() {
      stopping = true;
      clearInterval(heartbeat);
      clearTimers();
      stream?.close();
      await queue.close();
    },
    get queued() {
      return queue.size;
    },
  };
}
