import { IdResolver } from "@atproto/identity";
import { db, nagiActors } from "@bsky-affirmative-bot/database";
import { sql } from "drizzle-orm";

// 一度に解決する did 数（各 did で DID ドキュメント取得の network 呼びが発生するので控えめに）。
const BATCH_SIZE = 8;
const BUSY_INTERVAL_MS = 3_000;
const IDLE_INTERVAL_MS = 60_000;
// 解決済み actor を再解決するまでの猶予。handle は可変（ユーザーが独自ドメインに変えうる）なので、
// 一度解決したきりにすると旧 handle を永久に表示し続ける。
const STALE_AFTER_HOURS = 24;
// 解決に失敗した did を次に試すまでの間隔。DID ドキュメントを引けない did（削除済みアカウント等）は
// resolved_at が入らないため優先順の先頭に居座り続け、stale な actor の再解決を止めてしまう。
const RETRY_COOLDOWN_MS = 10 * 60_000;

let running = false;
const resolver = new IdResolver();
/** 直近で解決に失敗した did → 失敗時刻。永続化不要（失敗は次回起動で再挑戦してよい）。 */
const failedAt = new Map<string, number>();

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
    // Nagi ネットワークに現れる did（プロフィール保持者＋投稿者）のうち、未解決のものと
    // 解決が古くなったものを拾う。handle は DID と違って可変なので、未解決だけを対象にすると
    // ハンドル変更が永久に反映されない。未解決 → 古い順で優先し、新規参加者を待たせない。
    const rows = (await db.execute(sql`
      select d.did from (
        select did from nagi.profiles
        union
        select did from nagi.posts where deleted_at is null
      ) d
      left join nagi.actors a on a.did = d.did
      where a.did is null
         or a.resolved_at < now() - make_interval(hours => ${STALE_AFTER_HOURS})
      order by a.resolved_at asc nulls first
      limit ${BATCH_SIZE * 4}
    `)) as unknown as Array<{ did: string }>;

    // クールダウン中の did を落としてから 1 バッチ分に切り詰める。SQL 側で除外しないのは、
    // 失敗 did のリストが可変長でクエリのプリペアが効かなくなるため。多めに取って絞るほうが単純。
    const now = Date.now();
    for (const [did, at] of failedAt) {
      if (now - at >= RETRY_COOLDOWN_MS) failedAt.delete(did);
    }
    const targets = rows
      .filter(({ did }) => !failedAt.has(did))
      .slice(0, BATCH_SIZE);

    if (!targets.length) return 0;

    let resolved = 0;
    for (const { did } of targets) {
      const actor = await resolveActor(did);
      if (!actor) {
        // 解決失敗。クールダウンを置いて再挑戦する（先頭に居座らせない）。
        failedAt.set(did, Date.now());
        continue;
      }
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
