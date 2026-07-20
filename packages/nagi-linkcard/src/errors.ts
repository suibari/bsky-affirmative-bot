// リンクカード取得で発生したエラー。呼び出し側（appview の XRPC ルート）が
// HTTP ステータス・エラーコードへそのまま詰め替えられるよう情報を持たせる。
export class LinkMetadataError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "LinkMetadataError";
  }
}
