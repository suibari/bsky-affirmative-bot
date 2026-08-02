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
  endpoint: string | undefined;
  wantedCollections: string[];
  onCreate?: Record<string, JetstreamCallback>;
  onDelete?: Record<string, JetstreamCallback>;
  reconnectDelayMs?: number;
  onHealth?: (event: JetstreamHealthEvent) => void;
  healthIntervalMs?: number;
};

export type BotJetstreamConnection = {
  close: () => void;
};

export function startBotJetstream({
  endpoint,
  wantedCollections,
  onCreate = {},
  onDelete = {},
  reconnectDelayMs = 1_000,
  onHealth,
  healthIntervalMs = 30_000,
}: BotJetstreamOptions): BotJetstreamConnection {
  let jetstream: Jetstream | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let stopped = false;
  let connected = false;

  /**
   * 購読しているコレクションが静かでも「生きている」と言えるよう、受信イベント数
   * ではなく接続状態そのものを定期的に報告する。イベント駆動にすると、低トラフィック
   * な Nagi のコレクションでは正常なのに応答なしに見えてしまう。
   */
  const reportAlive = () => {
    if (connected) onHealth?.({ ok: true, detail: { endpoint: endpoint ?? "(default)" } });
  };

  const connect = () => {
    if (stopped) {
      return;
    }

    jetstream = new Jetstream({ ws, endpoint, wantedCollections });

    for (const [collection, callback] of Object.entries(onCreate)) {
      jetstream.onCreate(collection as any, callback as any);
    }

    for (const [collection, callback] of Object.entries(onDelete)) {
      jetstream.onDelete(collection as any, callback as any);
    }

    jetstream.on("open", () => {
      connected = true;
      reportAlive();
    });

    jetstream.on("error", (error) => {
      console.error("[ERROR] Jetstream WebSocket error:", error);
      connected = false;
      onHealth?.({ ok: false, error });
    });

    jetstream.on("close", () => {
      connected = false;

      if (stopped) {
        return;
      }

      onHealth?.({ ok: false, error: new Error("Jetstream connection closed") });

      console.log(
        `[INFO] Jetstream connection closed. Reconnecting in ${reconnectDelayMs / 1_000} seconds.`,
      );
      reconnectTimer = setTimeout(connect, reconnectDelayMs);
    });

    jetstream.start();
    console.log("[INFO] Jetstream connection established.");
  };

  connect();

  const healthTimer = onHealth ? setInterval(reportAlive, healthIntervalMs) : null;
  healthTimer?.unref();

  return {
    close() {
      stopped = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (healthTimer) {
        clearInterval(healthTimer);
      }
      jetstream?.close();
    },
  };
}
