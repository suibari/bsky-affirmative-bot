import { Jetstream } from "@skyware/jetstream";
import ws from "ws";

export type JetstreamCallback = (event: any) => Promise<void> | void;

export type BotJetstreamOptions = {
  endpoint: string | undefined;
  wantedCollections: string[];
  onCreate?: Record<string, JetstreamCallback>;
  onDelete?: Record<string, JetstreamCallback>;
  reconnectDelayMs?: number;
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
}: BotJetstreamOptions): BotJetstreamConnection {
  let jetstream: Jetstream | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let stopped = false;

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

    jetstream.on("error", (error) => {
      console.error("[ERROR] Jetstream WebSocket error:", error);
    });

    jetstream.on("close", () => {
      if (stopped) {
        return;
      }

      console.log(
        `[INFO] Jetstream connection closed. Reconnecting in ${reconnectDelayMs / 1_000} seconds.`,
      );
      reconnectTimer = setTimeout(connect, reconnectDelayMs);
    });

    jetstream.start();
    console.log("[INFO] Jetstream connection established.");
  };

  connect();

  return {
    close() {
      stopped = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      jetstream?.close();
    },
  };
}
