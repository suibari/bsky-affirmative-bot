import {
  getLinkMetadata as getLinkMetadataShared,
  getLinkThumbnail as getLinkThumbnailShared,
  resolveFavicon as resolveFaviconShared,
} from "@bsky-affirmative-bot/nagi-linkcard";
import { toApiError } from "../util/linkCardError.js";

// OGP 取得の実装は @bsky-affirmative-bot/nagi-linkcard に集約し、
// Bot の定期投稿でも同一ロジックでリンクカードを生成できるようにしている。
export const getLinkMetadata = (raw: string, forceFallback = false) =>
  toApiError(() => getLinkMetadataShared(raw, forceFallback));

export const getLinkThumbnail = (raw: string) => toApiError(() => getLinkThumbnailShared(raw));

// 任意アプリ連携のアイコン解決。連携設定時に1回だけ呼び、結果 URL を appLinks レコードへ保存する。
export const getAppIcon = (raw: string) => toApiError(() => resolveFaviconShared(raw));
