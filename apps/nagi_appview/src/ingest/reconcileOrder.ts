/**
 * PDS 照合で初めて取り込むレコードは、照合時刻ではなくレコード作成時刻へ並べる。
 * 未来日時によってフィード先頭を占有できないよう、現在時刻を上限にする。
 */
export const reconciledIndexedAt = (
  recordCreatedAt: Date,
  now = new Date(),
): Date => new Date(Math.min(recordCreatedAt.getTime(), now.getTime()));
