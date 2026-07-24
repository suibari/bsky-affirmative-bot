import { IdResolver } from "@atproto/identity";
import { db, nagiActors } from "@bsky-affirmative-bot/database";
import { sql } from "drizzle-orm";

// 一度に解決する did 数（各 did で DID ドキュメント取得の network 呼びが発生するので控えめに）。
const BATCH_SIZE = 8;
const BUSY_INTERVAL_MS = 3_000;
const IDLE_INTERVAL_MS = 60_000;

let running = false;
const resolver = new IdResolver();

/**
 * DID ドキュメントから handle（alsoKnownAs）と PDS エンドポイントを解決する。
 * 真実源は PDS/DID ドキュメントで、nagiActors はその再構築可能なインデックス（キャッシュ）。
 */
async function resolveActor(
  did: string,
): Promise<{ handle: string; pdsUrl: string } | null> {
  try {
    const doc = await resolver.did.resolve(did);
    if (!doc) return null;
    const aka = doc.alsoKnownAs?.find((u) => u.startsWith("at://"));
    const handle = aka ? aka.slice("at://".length) : did;
    const pds = doc.service?.find(
      (s: { id?: string }) => s.id === "#atproto_pds",
    )?.serviceEndpoint;
    // pds_url は NOT NULL。PDS を引けない DID は今回スキップ（次 tick で再挑戦）。
    if (typeof pds !== "string") return null;
    return { handle, pdsUrl: pds };
  } catch {
    return null;
  }
}

/**
 * profiles / posts に現れる did のうち nagiActors 行が無いものを解決してインデックスするワーカー。
 * これで searchActors（active な actor を innerJoin）とハンドル表示（handle 未解決だと DID に
 * フォールバック）が機能する。埋め込みワーカーと同じく AppView 内の非同期ループで回す。
 */
export function startActorResolveWorker() {
  if (running) return;
  running = true;

  const tick = async (): Promise<number> => {
    // Nagi ネットワークに現れる did（プロフィール保持者＋投稿者）で未解決のものを拾う。
    const rows = (await db.execute(sql`
      select d.did from (
        select did from nagi.profiles
        union
        select did from nagi.posts where deleted_at is null
      ) d
      where not exists (select 1 from nagi.actors a where a.did = d.did)
      limit ${BATCH_SIZE}
    `)) as unknown as Array<{ did: string }>;

    if (!rows.length) return 0;

    let resolved = 0;
    for (const { did } of rows) {
      const actor = await resolveActor(did);
      if (!actor) continue; // 解決失敗。次 tick で再挑戦。
      await db
        .insert(nagiActors)
        .values({
          did,
          handle: actor.handle,
          pdsUrl: actor.pdsUrl,
          status: "active",
        })
        .onConflictDoUpdate({
          target: nagiActors.did,
          set: {
            handle: actor.handle,
            pdsUrl: actor.pdsUrl,
            resolvedAt: new Date(),
          },
        });
      resolved++;
    }
    return resolved;
  };

  const loop = async () => {
    let processed = 0;
    try {
      processed = await tick();
    } catch (e) {
      console.error("[ERROR][actorResolveWorker]", e);
    }
    setTimeout(
      () => void loop(),
      processed > 0 ? BUSY_INTERVAL_MS : IDLE_INTERVAL_MS,
    );
  };

  void loop();
}
