const ORDER_REPAIR_THRESHOLD_MS = 5 * 60 * 1_000;

/**
 * PDS 照合で初めて取り込むレコードは、照合時刻ではなくレコード作成時刻へ並べる。
 * 未来日時によってフィード先頭を占有できないよう、現在時刻を上限にする。
 */
export const reconciledIndexedAt = (
  recordCreatedAt: Date,
  now = new Date(),
): Date => new Date(Math.min(recordCreatedAt.getTime(), now.getTime()));

/**
 * 通常の取り込み遅延は触らず、過去レコードが照合時刻で挿入されたと判断できる差だけを直す。
 */
export const needsReconcileOrderRepair = (
  recordCreatedAt: Date,
  indexedAt: Date,
): boolean =>
  indexedAt.getTime() - recordCreatedAt.getTime() > ORDER_REPAIR_THRESHOLD_MS;
