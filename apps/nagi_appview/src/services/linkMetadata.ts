import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ApiError } from "../middleware/errors.js";

const HTML_LIMIT = 1_000_000;
const IMAGE_LIMIT = 1_000_000;
const CARDYB_LIMIT = 100_000;
const REDIRECT_LIMIT = 4;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const blockedAddress = (address: string) => {
  if (address === "::1" || address === "::" || address.startsWith("fe80:") || address.startsWith("fc") || address.startsWith("fd")) return true;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4) return false;
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

async function safeUrl(raw: string, base?: URL) {
  let url: URL;
  try {
    url = base ? new URL(raw, base) : new URL(raw);
  } catch {
    throw new ApiError(400, "invalid_request", "Invalid URL");
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new ApiError(400, "invalid_request", "Only public HTTP(S) URLs are supported");
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some(({ address }) => blockedAddress(address)))
    throw new ApiError(400, "invalid_request", "Private network URLs are not supported");
  return url;
}

async function limitedFetch(raw: string, accept: string) {
  let url = await safeUrl(raw);
  for (let redirects = 0; redirects <= REDIRECT_LIMIT; redirects++) {
    const response = await fetch(url, {
      redirect: "manual",
      headers: { accept, "user-agent": "NagiLinkPreview/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === REDIRECT_LIMIT)
        throw new ApiError(502, "upstream_unavailable", "Too many redirects");
      url = await safeUrl(location, url);
      continue;
    }
    if (!response.ok) throw new ApiError(502, "upstream_unavailable", "Link could not be fetched");
    return { response, url };
  }
  throw new ApiError(502, "upstream_unavailable", "Link could not be fetched");
}

async function bytes(response: Response, limit: number) {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > limit) throw new ApiError(413, "response_too_large", "Remote content is too large");
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError(413, "response_too_large", "Remote content is too large");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

const decode = (value: string) =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
const meta = (html: string, keys: string[]) => {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const pattern of [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
    ]) {
      const match = pattern.exec(html);
      if (match) return decode(match[1]);
    }
  }
};
const crop = (value: string | undefined, length: number) => value?.slice(0, length) || undefined;

type LinkMetadata = { uri: string; title: string; description?: string; image?: string };

async function fetchDirect(url: URL): Promise<LinkMetadata> {
  const { response, url: resolved } = await limitedFetch(url.href, "text/html,application/xhtml+xml");
  if (!response.headers.get("content-type")?.toLowerCase().includes("html"))
    throw new ApiError(415, "unsupported_media_type", "Link is not an HTML page");
  const html = new TextDecoder().decode(await bytes(response, HTML_LIMIT));
  const title =
    meta(html, ["og:title", "twitter:title"]) ??
    decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const description = meta(html, ["og:description", "twitter:description", "description"]);
  const image = meta(html, ["og:image:secure_url", "og:image", "twitter:image"]);
  return {
    uri: resolved.href,
    title: crop(title, 300) || resolved.hostname,
    ...(crop(description, 1000) ? { description: crop(description, 1000) } : {}),
    ...(image ? { image: (await safeUrl(image, resolved)).href } : {}),
  };
}

async function fetchViaCardyb(url: URL): Promise<LinkMetadata | undefined> {
  try {
    const response = await fetch(
      `https://cardyb.bsky.app/v1/extract?url=${encodeURIComponent(url.href)}`,
      {
        headers: { accept: "application/json", "user-agent": "NagiLinkPreview/1.0" },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) return;
    const body = JSON.parse(new TextDecoder().decode(await bytes(response, CARDYB_LIMIT))) as {
      url?: string;
      title?: string;
      description?: string;
      image?: string;
      error?: string;
    };
    if (body.error || !body.title?.trim()) return;
    const resolved = body.url ? await safeUrl(body.url) : url;
    const image = body.image ? await safeUrl(body.image, resolved) : undefined;
    return {
      uri: resolved.href,
      title: crop(body.title.trim(), 300)!,
      ...(crop(body.description?.trim(), 1000)
        ? { description: crop(body.description?.trim(), 1000) }
        : {}),
      ...(image ? { image: image.href } : {}),
    };
  } catch {
    return;
  }
}

export async function getLinkMetadata(raw: string, forceFallback = false) {
  const url = await safeUrl(raw);
  if (forceFallback)
    return (await fetchViaCardyb(url)) ?? { uri: url.href, title: url.hostname };
  try {
    const direct = await fetchDirect(url);
    if (direct.image) return direct;
    const fallback = await fetchViaCardyb(url);
    return fallback?.image ? { ...direct, image: fallback.image } : direct;
  } catch {
    return (await fetchViaCardyb(url)) ?? { uri: url.href, title: url.hostname };
  }
}

export async function getLinkThumbnail(raw: string) {
  const { response } = await limitedFetch(raw, "image/jpeg,image/png,image/webp");
  const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "";
  if (!allowedImageTypes.has(contentType))
    throw new ApiError(415, "unsupported_media_type", "Unsupported link thumbnail type");
  return { data: await bytes(response, IMAGE_LIMIT), contentType };
}
