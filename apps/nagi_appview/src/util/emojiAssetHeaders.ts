const IMMUTABLE_SECONDS = 31_536_000;
const IMMUTABLE_CACHE_CONTROL = `public, max-age=${IMMUTABLE_SECONDS}, immutable`;

/** 429・404・上流障害はCDNやブラウザへ残さず、次の要求で回復可能にする。 */
export function emojiAssetNoStoreHeaders() {
  return {
    "Cache-Control": "no-store",
    "CDN-Cache-Control": "no-store",
  };
}

/**
 * emoji-asset は公開レコードのCID固定URLで、閲覧者やOriginによって内容が変わらない。
 * ブラウザとCDNの双方が同じ成功レスポンスを長期再利用できるヘッダーを返す。
 */
export function emojiAssetHeaders(mediaType: string, contentLength?: number) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": IMMUTABLE_CACHE_CONTROL,
    "CDN-Cache-Control": IMMUTABLE_CACHE_CONTROL,
    "Content-Type": mediaType,
    ...(contentLength === undefined
      ? {}
      : { "Content-Length": String(contentLength) }),
    "X-Content-Type-Options": "nosniff",
  };
}
