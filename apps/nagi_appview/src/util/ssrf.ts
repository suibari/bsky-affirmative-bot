import {
  assertPublicHost as assertPublicHostShared,
  blockedAddress as blockedAddressShared,
  safeUrl as safeUrlShared,
} from "@bsky-affirmative-bot/nagi-linkcard";
import { toApiError } from "./linkCardError.js";

// 実装は @bsky-affirmative-bot/nagi-linkcard 側にあり（Bot からも同じ検証を使うため）、
// ここでは LinkMetadataError を appview の ApiError に詰め替えるだけ。
export const blockedAddress = blockedAddressShared;

export const assertPublicHost = (hostname: string) =>
  toApiError(() => assertPublicHostShared(hostname));

export const safeUrl = (raw: string, base?: URL) => toApiError(() => safeUrlShared(raw, base));
