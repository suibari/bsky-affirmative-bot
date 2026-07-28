export type SemanticRecordVersion = {
  uri: string;
  createdAt: Date;
};

/**
 * PDS に意味上同じレコードが別 rkey で複数ある場合の AppView 投影規則。
 * 同じ URI は PDS 上の現在値として常に更新し、別 URI 同士は createdAt が新しい方、
 * 同値なら URI の辞書順が後の方を採用して処理順に依存しないようにする。
 */
export function shouldAcceptSemanticRecord(
  current: SemanticRecordVersion | undefined,
  incoming: SemanticRecordVersion,
): boolean {
  if (!current || current.uri === incoming.uri) return true;
  const timeDifference =
    incoming.createdAt.getTime() - current.createdAt.getTime();
  if (timeDifference !== 0) return timeDifference > 0;
  return incoming.uri.localeCompare(current.uri) > 0;
}
