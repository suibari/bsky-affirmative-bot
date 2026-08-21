import { Jetstream } from "@skyware/jetstream";
import ws from "ws";

export type JetstreamCallback = (event: any) => Promise<void> | void;

/**
 * 接続状態の報告。bot-runtime は DB を知らないので、実際に書き込む先
 * （reportHeartbeat / reportHealthFailure）は呼び出し側が繋ぐ。
 */
export type JetstreamHealthEvent =
  | { ok: true; detail?: Record<string, unknown> }
  | { ok: false; error: unknown };

export type BotJetstreamOptions = {
  /** カンマ区切りで複数指定でき、繋がらない状態が続いたら次の候補へ移る。 */
  endpoint: string | undefined;
  wantedCollections: string[];
  onCreate?: Record<string, JetstreamCallback>;
  onUpdate?: Record<string, JetstreamCallback>;
  onDelete?: Record<string, JetstreamCallback>;
  onHealth?: (event: JetstreamHealthEvent) => void;
  healthIntervalMs?: number;
  rotateAfterMs?: number;
};

export type BotJetstreamConnection = {
  close: () => void;
};

/**
 * 同一エンドポイントへ繋がらない状態がここまで続いたら次の候補へ移る。
 * 瞬断は @skyware/jetstream 内部の partysocket が張り直すので、それより十分長く取る。
 */
const DEFAULT_ROTATE_AFTER_MS = 20_000;

export function startBotJetstream({
  endpoint,
  wantedCollections,
  onCreate = {},
  onUpdate = {},
  onDelete = {},
  onHealth,
  healthIntervalMs = 30_000,
  rotateAfterMs = DEFAULT_ROTATE_AFTER_MS,
}: BotJetstreamOptions): BotJetstreamConnection {
  // 未指定なら @skyware/jetstream の既定エンドポイントに任せる。
  const endpoints = (endpoint ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  let index = 0;
  const current = () => endpoints[index];

  let jetstream: Jetstream<any, any> | undefined;
  let rotateTimer: NodeJS.Timeout | null = null;
  let stopped = false;
  let connected = false;
  let lastEventAt: string | undefined;

  /**
   * 低トラフィックの購読でも接続状態は定期報告し、実イベントの最終受信時刻は
   * 補足情報として分けて載せる。監視側は用途に応じて両者を別々に判定できる。
   */
  const reportAlive = () => {
    if (connected) {
      onHealth?.({
        ok: true,
        detail: {
          endpoint: current() ?? "(default)",
          ...(lastEventAt ? { lastEventAt } : {}),
        },
      });
    }
  };

  const armRotate = () => {
    // 候補が1本以下なら張り直しても同じ先なので、partysocket の再接続に任せきる。
    if (stopped || rotateTimer || endpoints.length < 2) return;
    rotateTimer = setTimeout(() => {
      rotateTimer = null;
      if (stopped || connected) return;
      index = (index + 1) % endpoints.length;
      console.log(`[INFO] Jetstream rotating endpoint: ${current()}`);
      connect();
    }, rotateAfterMs);
    rotateTimer.unref?.();
  };

  const connect = () => {
    if (stopped) return;
    // 旧接続を残すと partysocket が裏で再接続し続け、同じイベントを二重に処理してしまう。
    jetstream?.close();

    const started = new Jetstream({ ws, endpoint: current(), wantedCollections });
    jetstream = started;

    for (const [collection, callback] of Object.entries(onCreate)) {
      started.onCreate(collection as any, callback as any);
    }

    for (const [collection, callback] of Object.entries(onUpdate)) {
      started.onUpdate(collection as any, callback as any);
    }

    for (const [collection, callback] of Object.entries(onDelete)) {
      started.onDelete(collection as any, callback as any);
    }

    // open は接続成立しか証明しない。実際に commit が届いた時刻を別に残し、
    // ダッシュボード側で Relay → Jetstream のイベント配送も判定できるようにする。
    started.on("commit", () => {
      if (started !== jetstream) return;
      lastEventAt = new Date().toISOString();
    });

    started.on("open", () => {
      if (started !== jetstream) return;
      connected = true;
      // 接続先を切り替えた後は、新しい接続で commit を受けるまで過去の実績を使わない。
      lastEventAt = undefined;
      if (rotateTimer) clearTimeout(rotateTimer);
      rotateTimer = null;
      console.log(`[INFO] Jetstream connection established: ${current() ?? "(default)"}`);
      reportAlive();
    });

    started.on("error", (error) => {
      if (started !== jetstream) return;
      console.error("[ERROR] Jetstream WebSocket error:", error);
      connected = false;
      onHealth?.({ ok: false, error });
      armRotate();
    });

    started.on("close", () => {
      if (started !== jetstream || stopped) return;
      connected = false;
      onHealth?.({ ok: false, error: new Error("Jetstream connection closed") });
      // 再接続そのものは @skyware/jetstream 内部の partysocket が行う。ここで新しい
      // Jetstream を作ると接続が二重になるので、候補の切り替えだけを見る。
      armRotate();
    });

    started.start();
    armRotate();
  };

  connect();

  const healthTimer = onHealth ? setInterval(reportAlive, healthIntervalMs) : null;
  healthTimer?.unref();

  return {
    close() {
      stopped = true;
      if (rotateTimer) {
        clearTimeout(rotateTimer);
        rotateTimer = null;
      }
      if (healthTimer) {
        clearInterval(healthTimer);
      }
      jetstream?.close();
    },
  };
}
