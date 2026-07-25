import {
  db,
  nagiCardCommentJobs,
  nagiCardDraws,
  nagiCardInstances,
} from "@bsky-affirmative-bot/database";
import {
  CARD_DEFS,
  cardDrawDate,
  cardKey,
  getCardDef,
  nextCardDrawAt,
  rollCard,
  type CardDefinition,
} from "@bsky-affirmative-bot/shared-configs";
import type {
  CardCollectionView,
  CardDrawStatus,
  CardView,
  DrawCardResult,
} from "@bsky-affirmative-bot/nagi-lexicon";
import { and, eq, sql } from "drizzle-orm";
import { ApiError } from "../middleware/errors.js";

/**
 * 全肯定カード。カード定義そのもの（名前/フレーバー/ATK）は shared-configs の JSON が真実源で、
 * DB が持つのは「誰がどの1枚を持っているか」だけ。だから定義側の文言を直せば全ユーザーに即反映される。
 *
 * 抽選は必ずここ（サーバ側）で行う。クライアントに引かせると当然ながら AAR を自称できてしまう。
 */

export type InstanceRow = {
  id: string;
  cardVolume: number;
  cardNumber: number;
  commentJa: string | null;
  commentEn: string | null;
  duplicateCount: number;
  acquiredAt: Date;
  firstOwnerDid: string;
};

/**
 * 定義 + 所持情報の合成。未所持でも定義部分は返す（コレクションの空き枠を描くため）。
 * カード定義はリポジトリに入っている静的データで秘密ではないので、伏せるのは UI の演出だけ。
 * export しているのはテストから直接叩くため。
 */
export const cardView = (def: CardDefinition, row?: InstanceRow): CardView => ({
  ...def,
  owned: !!row,
  ...(row
    ? {
        instanceId: row.id,
        ...(row.commentJa ? { commentJa: row.commentJa } : {}),
        ...(row.commentEn ? { commentEn: row.commentEn } : {}),
        duplicateCount: row.duplicateCount,
        acquiredAt: row.acquiredAt.toISOString(),
        firstOwnerDid: row.firstOwnerDid,
      }
    : {}),
});

async function loadInstances(did: string): Promise<Map<string, InstanceRow>> {
  const rows = await db
    .select({
      id: nagiCardInstances.id,
      cardVolume: nagiCardInstances.cardVolume,
      cardNumber: nagiCardInstances.cardNumber,
      commentJa: nagiCardInstances.commentJa,
      commentEn: nagiCardInstances.commentEn,
      duplicateCount: nagiCardInstances.duplicateCount,
      acquiredAt: nagiCardInstances.acquiredAt,
      firstOwnerDid: nagiCardInstances.firstOwnerDid,
    })
    .from(nagiCardInstances)
    .where(eq(nagiCardInstances.ownerDid, did));
  return new Map(
    rows.map((r) => [cardKey({ volume: r.cardVolume, id: r.cardNumber }), r]),
  );
}

/** 本日ぶんのドロー行。無ければ未ドロー。 */
async function loadTodayDraw(did: string, now: Date) {
  const [row] = await db
    .select({
      cardVolume: nagiCardDraws.cardVolume,
      cardNumber: nagiCardDraws.cardNumber,
    })
    .from(nagiCardDraws)
    .where(
      and(
        eq(nagiCardDraws.did, did),
        eq(nagiCardDraws.drawDate, cardDrawDate(now)),
      ),
    )
    .limit(1);
  return row;
}

function drawStatusOf(
  today: { volume: number; id: number } | undefined,
  now: Date,
): CardDrawStatus {
  return {
    canDraw: !today,
    nextDrawAt: nextCardDrawAt(now).toISOString(),
    ...(today ? { todayCardVolume: today.volume, todayCardId: today.id } : {}),
  };
}

/**
 * 指定ユーザーのコレクション。未所持のカードも定義だけ返す（何が埋まっていないかを見せたい）。
 * 所持状況は公開情報なので誰から見ても同じ内容を返すが、drawStatus は本人にしか付けない。
 */
export async function getCards(
  actor: string,
  viewerDid?: string,
): Promise<CardCollectionView> {
  if (!/^did:(plc|web):/.test(actor))
    throw new ApiError(400, "invalid_request", "actor must be a DID");

  const now = new Date();
  const isSelf = !!viewerDid && viewerDid === actor;
  const [instances, todayDraw] = await Promise.all([
    loadInstances(actor),
    isSelf ? loadTodayDraw(actor, now) : Promise.resolve(undefined),
  ]);

  // 並びは CARD_DEFS の順（= 図鑑の順）。所持状況で並べ替えないこと。
  const cards = CARD_DEFS.map((def) => cardView(def, instances.get(cardKey(def))));
  return {
    cards,
    ownedCount: instances.size,
    totalCount: CARD_DEFS.length,
    ...(isSelf
      ? {
          drawStatus: drawStatusOf(
            todayDraw
              ? { volume: todayDraw.cardVolume, id: todayDraw.cardNumber }
              : undefined,
            now,
          ),
        }
      : {}),
  };
}

/**
 * 1日1回のドロー。
 *
 * 「今日引いたか」の判定はアプリ側の事前チェックではなく、card_draws の主キー
 * (did, draw_date) への衝突で行う。同時押しや二重送信でも DB 側で1回に収束するため。
 * 既に引いていた場合はエラーにせず、その日のカードをそのまま返す（updateSeen / setMute と
 * 同じ冪等方針。リロードしても「今日のカード」が見えるほうが UI が素直になる）。
 */
export async function drawCard(viewerDid: string): Promise<DrawCardResult> {
  const now = new Date();
  const drawDate = cardDrawDate(now);

  const result = await db.transaction(async (tx) => {
    const rolled = rollCard();

    // 1) まず日次ロックを取りに行く。ON CONFLICT DO NOTHING なので同時押しでも例外にならず、
    //    行が返らなかった側が「既に引いていた」経路へ落ちる。事前 SELECT で判定すると
    //    二重送信で両方が通過してしまうため、必ず insert の衝突で判定すること。
    const [won] = await tx
      .insert(nagiCardDraws)
      .values({
        did: viewerDid,
        drawDate,
        cardVolume: rolled.volume,
        cardNumber: rolled.id,
      })
      .onConflictDoNothing()
      .returning({ cardNumber: nagiCardDraws.cardNumber });

    if (!won) {
      const [existing] = await tx
        .select({
          cardVolume: nagiCardDraws.cardVolume,
          cardNumber: nagiCardDraws.cardNumber,
        })
        .from(nagiCardDraws)
        .where(
          and(
            eq(nagiCardDraws.did, viewerDid),
            eq(nagiCardDraws.drawDate, drawDate),
          ),
        )
        .limit(1);
      if (!existing)
        throw new ApiError(409, "conflict", "Draw is being processed");
      return {
        card: { volume: existing.cardVolume, id: existing.cardNumber },
        alreadyDrawn: true,
        isNew: false,
      };
    }

    // 2) ロックを取れた側だけがコレクションを更新する。
    //    同種の引き直しは行を増やさず duplicate_count を上げ、コメントは一旦クリアして
    //    生成し直させる（「同種カードを引いた場合、コメントは上書き」の仕様）。
    const [instance] = await tx
      .insert(nagiCardInstances)
      .values({
        cardVolume: rolled.volume,
        cardNumber: rolled.id,
        ownerDid: viewerDid,
        firstOwnerDid: viewerDid,
      })
      .onConflictDoUpdate({
        target: [
          nagiCardInstances.ownerDid,
          nagiCardInstances.cardVolume,
          nagiCardInstances.cardNumber,
        ],
        set: {
          duplicateCount: sql`${nagiCardInstances.duplicateCount} + 1`,
          acquiredAt: new Date(),
          commentJa: null,
          commentEn: null,
          commentModel: null,
          commentPromptVersion: null,
        },
      })
      .returning({
        id: nagiCardInstances.id,
        duplicateCount: nagiCardInstances.duplicateCount,
      });

    // 3) ドロー履歴に実体を紐づける（1 の時点では instance がまだ無いので後埋め）。
    await tx
      .update(nagiCardDraws)
      .set({ instanceId: instance.id })
      .where(
        and(
          eq(nagiCardDraws.did, viewerDid),
          eq(nagiCardDraws.drawDate, drawDate),
        ),
      );

    // 4) コメント生成は Gemini 呼び出しなので同期では待たない。nagi_bot_server の
    // NagiCardCommentWorker が拾う（自動分析と同じ「enqueue は AppView / worker は bot」構成）。
    await tx
      .insert(nagiCardCommentJobs)
      .values({ instanceId: instance.id })
      .onConflictDoUpdate({
        target: nagiCardCommentJobs.instanceId,
        set: {
          state: "pending",
          attempts: 0,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        },
      });

    return {
      card: { volume: rolled.volume, id: rolled.id },
      alreadyDrawn: false,
      isNew: instance.duplicateCount === 1,
    };
  });

  const instances = await loadInstances(viewerDid);
  const def = getCardDef(result.card.volume, result.card.id);
  if (!def)
    // 定義から消えた番号が draws に残っているケース。番号は変更禁止なので通常起きない。
    throw new ApiError(
      500,
      "internal_error",
      `unknown card v${result.card.volume}-${result.card.id}`,
    );
  const row = instances.get(cardKey(result.card));

  return {
    card: cardView(def, row),
    alreadyDrawn: result.alreadyDrawn,
    isNew: result.isNew,
    commentPending: !row?.commentJa,
    drawStatus: drawStatusOf(result.card, now),
  };
}
