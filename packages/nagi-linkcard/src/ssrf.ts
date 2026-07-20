import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { LinkMetadataError } from "./errors.js";

// ループバック・リンクローカル・RFC1918 のプライベート範囲（IPv4/IPv6）をブロックする。
export const blockedAddress = (address: string) => {
  if (address === "::1" || address === "::" || address.startsWith("fe80:") || address.startsWith("fc") || address.startsWith("fd")) return true;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] >= 224
  );
};

// プライベート/ループバックアドレスに解決されるホスト名を拒否する。
// 信頼できない入力由来のホスト（例: did:web のオーソリティ）へアクセスする前に使う。
export async function assertPublicHost(hostname: string) {
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some(({ address }) => blockedAddress(address)))
    throw new LinkMetadataError(400, "invalid_request", "Private network hosts are not supported");
}

// URL が公開 HTTP(S) エンドポイント（認証情報の埋め込みが無く、非プライベート
// アドレスに解決される）であることを検証し、パース済み URL を返す。
export async function safeUrl(raw: string, base?: URL) {
  let url: URL;
  try {
    url = base ? new URL(raw, base) : new URL(raw);
  } catch {
    throw new LinkMetadataError(400, "invalid_request", "Invalid URL");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new LinkMetadataError(400, "invalid_request", "Only public HTTP(S) URLs are supported");
  await assertPublicHost(url.hostname);
  return url;
}
